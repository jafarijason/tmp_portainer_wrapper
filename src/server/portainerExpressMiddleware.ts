import { Router } from "express"
import fetch from "node-fetch"
import jwt from "jsonwebtoken"
import fs,{ createWriteStream, createReadStream } from "fs-extra";
import { pipeline } from "stream";
import { promisify } from "util";
import path from "path";
import AWS from 'aws-sdk';
import { UnprocessableEntityException } from '@nestjs/common';
import moment from 'moment'

const pipelineAsync = promisify(pipeline);

interface S3BackupConfig {
    bucket: string;
    region: string;
    accessKey: string;
    secretKey: string;
    accessPointUrl: string;
    backupPassword: string;
    backupRelativePath: string;
    backupPreFix: string;
}

interface PortainerWrapperConfig {
    portainerUrl: string;
    portainerUserName: string;
    portainerPassword: string;
    s3BackupConfig?: S3BackupConfig;
    refreshApiTokenIntervalSec?: number;
}

let portainerUrl = ""
let portainerUserName = ""
let portainerPassword = ""
let portainerApiToken = ""
let portainerApiTokenPayload: any = {}
let s3BackupConfig: S3BackupConfig

const portainerExpressMiddleware = Router()

// Configure AWS S3 client
let s3Client: AWS.S3;

const configureS3Client = (s3BackupConfig: S3BackupConfig) => {
    s3Client = new AWS.S3({
        ...(s3BackupConfig?.accessPointUrl ? {
            endpoint: s3BackupConfig?.accessPointUrl
        } : {}),
        accessKeyId: s3BackupConfig.accessKey,
        secretAccessKey: s3BackupConfig.secretKey,
        region: s3BackupConfig.region,
    });
};

const uploadToS3 = async (filePath: string, s3Config: S3BackupConfig) => {
    const fileStream = createReadStream(filePath);
    const uploadParams = {
        Bucket: s3Config.bucket,
        Key: `${s3Config.backupRelativePath}/${s3Config.backupPreFix}_${path.basename(filePath)}`,
        Body: fileStream,
    };
    return s3Client.upload(uploadParams).promise();
};


portainerExpressMiddleware.get("/test", (req, res) => {
    res.send("Test endpoint is working!")
})

const commonHeaders = { "Content-Type": "application/json" }

const ensurePortainerApiToken = async () => {
    const currentTimeInSeconds = Math.floor(Date.now() / 1000)
    const tokenExpiry = portainerApiTokenPayload?.exp || 0

    if (tokenExpiry - currentTimeInSeconds > 600) {
        return portainerApiToken
    }

    const responseRaw = await fetch(`${portainerUrl}/api/auth`, {
        method: "POST",
        headers: {
            ...commonHeaders,
        },
        body: JSON.stringify({
            password: portainerPassword,
            username: portainerUserName,
        }),
    })

    const response: any = await responseRaw.json()
    portainerApiToken = response?.jwt
    portainerApiTokenPayload = jwt.decode(portainerApiToken)
    // console.log('new portainerApiToken with payload of generated ', portainerApiTokenPayload)

    return portainerApiToken
}

export const portainerExpressMiddlewareWrapper = (config: PortainerWrapperConfig) => {
    portainerUrl = config.portainerUrl;
    portainerUserName = config.portainerUserName;
    portainerPassword = config.portainerPassword;
    if (config?.s3BackupConfig?.accessKey) {
        s3BackupConfig = config?.s3BackupConfig
        configureS3Client(config.s3BackupConfig);
    }


    (async () => {
        await ensurePortainerApiToken()
    })()

    if (config.refreshApiTokenIntervalSec > 0) {
        setInterval(async () => {
            await ensurePortainerApiToken();
        }, config.refreshApiTokenIntervalSec);
    }

    return portainerExpressMiddleware
}


portainerExpressMiddleware.post("/backup", async (req, res) => {
    const isoTimeStamp = moment().toISOString()
    try {
        if (!s3BackupConfig?.accessKey) {
            throw new UnprocessableEntityException('s3 backup did not specified')
        }
        await ensurePortainerApiToken();

        // Path to save the tar.gz file
        const backupFilePath = path.join(__dirname, `${isoTimeStamp}_encrypt.tar.gz`);

        const backupResponse = await fetch(`${portainerUrl}/api/backup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${portainerApiToken}`,
            },
            body: JSON.stringify({
                password: s3BackupConfig.backupPassword || "",
            }),
        });

        if (!backupResponse.ok) {
            return res.status(backupResponse.status).json({
                message: "Failed to create backup",
                status: backupResponse.statusText,
            });
        }

        // Stream the backup content into a tar.gz file
        const backupFileStream = createWriteStream(backupFilePath);
        await pipelineAsync(backupResponse.body, backupFileStream);

        // Upload the tar.gz file to S3
        const uploadResult = await uploadToS3(backupFilePath, s3BackupConfig);
        const s3FileUrl = uploadResult.Location;

        await fs.unlink(backupFilePath)

        // Respond with the S3 file URL
        res.status(200).json({ message: "Backup stored in S3", fileUrl: s3FileUrl, isoTimeStamp });

    } catch (error) {
        res.status(500).json({ message: "Error creating or storing backup", error });
    }
});

