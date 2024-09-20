import moment from "moment";
import { ensurePortainerApiToken, portainerEnvironmentsSnapShot, portainerApiToken, portainerUrl, portainerWrapperDataFolderPath, s3BackupConfig, uploadToS3 } from "./portainerExpressMiddleware";
import { UnprocessableEntityException } from "@nestjs/common";
import { pipeline } from "stream";
import { promisify } from "util";

import fs from "fs-extra";
import { portainerApiAndJsonResponse } from "./portainerApi";
import { Router } from "express";
const pipelineAsync = promisify(pipeline);

export const portainerExpressMiddleware = Router()

portainerExpressMiddleware.get("/test", (req, res) => {
    res.send("Test endpoint is working!")
})

portainerExpressMiddleware.post("/backup", async (req, res) => {
    const isoTimeStamp = moment().toISOString()
    try {
        if (!s3BackupConfig?.accessKey) {
            throw new UnprocessableEntityException('s3 backup did not specified')
        }
        await ensurePortainerApiToken();

        // Path to save the tar.gz file
        const backupFilePath = `${portainerWrapperDataFolderPath}/${isoTimeStamp}_encrypt.tar.gz`;

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
        const backupFileStream = fs.createWriteStream(backupFilePath);
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

console.log('aaaaaaaaaaaaa================')


export const ensuePortainerSnapShotEnvs = async () => {
    await ensurePortainerApiToken();
    const snapShot: any = await portainerApiAndJsonResponse({
        path: `${portainerUrl}/api/endpoints`,
        token: portainerApiToken,
        method: 'GET',
        body: {}
    })
    portainerEnvironmentsSnapShot.timeStamp = moment().toISOString()
    snapShot.forEach((env) => {
        portainerEnvironmentsSnapShot.envs[env.Name] = {
            ...env,
            timeStamp: portainerEnvironmentsSnapShot.timeStamp
        }
    })
    await fs.writeFile(
        `${portainerWrapperDataFolderPath}/portainerEnvironmentsSnapShot.json`,
        JSON.stringify(portainerEnvironmentsSnapShot, null, 4),
        "utf8"
    )
    return snapShot
}

portainerExpressMiddleware.post("/snapshot", async (req, res) => {
    const snapShot = await ensuePortainerSnapShotEnvs()
    // portainerEnvironmentsSnapShot.envsList = snapShot
    res.json(snapShot);
});
