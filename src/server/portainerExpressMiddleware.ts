import { Router } from "express"
import fetch from "node-fetch"
import jwt from "jsonwebtoken"
import fs, { createWriteStream, createReadStream } from "fs-extra";

import path from "path";
import AWS from 'aws-sdk';
import { UnprocessableEntityException } from '@nestjs/common';
import moment from 'moment'
import { portainerApiAndJsonResponse } from "./portainerApi";
import { ensuePortainerSnapShotEnvs, portainerExpressMiddleware } from "./routesFn";




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
    portainerWrapperDataFolderPath: string;
    portainerTemplatesFolder: string
}

export let portainerUrl = ""
export let portainerUserName = ""
export let portainerPassword = ""
export let portainerApiToken = ""
export let portainerApiTokenPayload: any = {}
export let s3BackupConfig: S3BackupConfig
export let portainerWrapperDataFolderPath = ""



export let portainerEnvironmentsSnapShot = {
    timeStamp: moment().toISOString(),
    envs: {}
}



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

export const uploadToS3 = async (filePath: string, s3Config: S3BackupConfig) => {
    const fileStream = createReadStream(filePath);
    const uploadParams = {
        Bucket: s3Config.bucket,
        Key: `${s3Config.backupRelativePath}/${s3Config.backupPreFix}_${path.basename(filePath)}`,
        Body: fileStream,
    };
    return s3Client.upload(uploadParams).promise();
};




const commonHeaders = { "Content-Type": "application/json" }

export const ensurePortainerApiToken = async () => {
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
    portainerWrapperDataFolderPath = config.portainerWrapperDataFolderPath;
    if (config?.s3BackupConfig?.accessKey) {
        s3BackupConfig = config?.s3BackupConfig
        configureS3Client(config.s3BackupConfig);
    }

    (async () => {
        try {
            if (!fs.existsSync(portainerWrapperDataFolderPath)) {
                fs.mkdirSync(portainerWrapperDataFolderPath, { recursive: true });
            }
            const portainerEnvironmentsSnapShotFromFile = await fs.readJSON(`${portainerWrapperDataFolderPath}/portainerEnvironmentsSnapShot.json`) || {}
            if (
                portainerEnvironmentsSnapShotFromFile.timeStamp
                && moment(portainerEnvironmentsSnapShotFromFile.timeStamp).isAfter(moment().add('20', 'minutes'))) {
                await ensuePortainerSnapShotEnvs()
            } else {
                portainerEnvironmentsSnapShot = {
                    ...portainerEnvironmentsSnapShot,
                    ...portainerEnvironmentsSnapShotFromFile
                }
            }
        } catch (err) {
            try {
                await ensuePortainerSnapShotEnvs()
            } catch (err) {
                //
            }
            //
        }
    })();

    if (config.refreshApiTokenIntervalSec > 0) {
        setInterval(async () => {
            try {
                await ensurePortainerApiToken();
            } catch (err) {
                //
            }
        }, config.refreshApiTokenIntervalSec);
    }

    return portainerExpressMiddleware
}


