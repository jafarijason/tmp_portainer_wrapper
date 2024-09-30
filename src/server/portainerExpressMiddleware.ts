import { Router } from "express"
import fetch from "node-fetch"
import jwt from "jsonwebtoken"
import fs, { createWriteStream, createReadStream } from "fs-extra"

import path from "path"
import AWS from "aws-sdk"
import { UnprocessableEntityException } from "@nestjs/common"
import moment from "moment"
import { portainerApiAndJsonResponse } from "./portainerApi"
import { ensueInfisicalProjectsSnapShot, ensuePortainerSnapShotEnvs, portainerExpressMiddleware } from "./routesFn"
import { InfisicalSDK, ApiClient } from "@infisical/sdk"

interface S3BackupConfig {
    bucket: string
    region: string
    accessKey: string
    secretKey: string
    accessPointUrl: string
    backupPassword: string
    backupRelativePath: string
    backupPreFix: string
}

interface InfisicalConfig {
    infisicalHostUrl: string
    infisicalClientId: string
    infisicalClientSecret: string
    infisicalOrganizationId: string
    refreshApiTokenIntervalSec?: number
}

interface PortainerWrapperConfig {
    portainerUrl: string
    portainerUserName: string
    portainerPassword: string
    s3BackupConfig?: S3BackupConfig
    refreshApiTokenIntervalSec?: number
    portainerWrapperFolder: string
    infisicalConfig?: InfisicalConfig
}

export let portainerUrl = ""
export let portainerUserName = ""
export let portainerPassword = ""
export let portainerApiToken = ""
export let portainerApiTokenPayload: any = {}
export let s3BackupConfig: S3BackupConfig
export let portainerWrapperFolder = ""
export let portainerWrapperTmpFolderPath = ""
export let infisicalConfig: InfisicalConfig
export let infisicalApiToken = ""
export let infisicalApiTokenPayload: any = {}

export let portainerEnvironmentsSnapShot = {
    timeStamp: moment().toISOString(),
    envs: {},
}
export let infisicalProjectsSnapShot = {
    timeStamp: moment().toISOString(),
    projects: {},
}

// Configure AWS S3 client
let s3Client: AWS.S3

const configureS3Client = (s3BackupConfig: S3BackupConfig) => {
    s3Client = new AWS.S3({
        ...(s3BackupConfig?.accessPointUrl
            ? {
                endpoint: s3BackupConfig?.accessPointUrl,
            }
            : {}),
        accessKeyId: s3BackupConfig.accessKey,
        secretAccessKey: s3BackupConfig.secretKey,
        region: s3BackupConfig.region,
    })
}

// Configure Infisical Client
let infisicalClient: InfisicalSDK

const configureInfisicalClient = async (infisicalConfig: InfisicalConfig) => {
    infisicalClient = new InfisicalSDK({
        siteUrl: infisicalConfig?.infisicalHostUrl,
    })

    try {
        await infisicalClient.auth().universalAuth.login({
            clientId: infisicalConfig.infisicalClientId,
            clientSecret: infisicalConfig.infisicalClientSecret,
        })
    } catch (err) {
        console.log(`Error configureInfisicalClient`, err.message)
    }

    if (infisicalConfig?.refreshApiTokenIntervalSec) {
        setInterval(async () => {
            try {
                await infisicalClient.auth().universalAuth.login({
                    clientId: infisicalConfig.infisicalClientId,
                    clientSecret: infisicalConfig.infisicalClientSecret,
                })
            } catch (err) {
                console.log(`Error setInterval.configureInfisicalClient`, err.message)
            }
        }, infisicalConfig?.refreshApiTokenIntervalSec)
    }
}

export const uploadToS3 = async (filePath: string, s3Config: S3BackupConfig) => {
    const fileStream = createReadStream(filePath)
    const uploadParams = {
        Bucket: s3Config.bucket,
        Key: `${s3Config.backupRelativePath}/${s3Config.backupPreFix}_${path.basename(filePath)}`,
        Body: fileStream,
    }
    return s3Client.upload(uploadParams).promise()
}

const commonHeaders = { "Content-Type": "application/json" }

export const ensureInfisicalApiToken = async () => {
    try {
        const currentTimeInSeconds = Math.floor(Date.now() / 1000)
        const tokenExpiry = infisicalApiTokenPayload?.exp || 0

        if (tokenExpiry - currentTimeInSeconds > 600) {
            return infisicalApiToken
        }

        const responseRaw = await fetch(`${infisicalConfig.infisicalHostUrl}/api/v1/auth/universal-auth/login`, {
            method: "POST",
            headers: {
                ...commonHeaders,
            },
            body: JSON.stringify({
                clientId: infisicalConfig?.infisicalClientId,
                clientSecret: infisicalConfig?.infisicalClientSecret,
            }),
        })

        const response: any = await responseRaw.json()
        infisicalApiToken = response?.accessToken
        // console.log(infisicalApiToken)
        infisicalApiTokenPayload = jwt.decode(infisicalApiToken)
        // console.log('new infisicalApiToken with payload of generated ', infisicalApiTokenPayload)

        return infisicalApiToken
    } catch (err) {
        console.error("Error ensureInfisicalApiToken", err.message)
    }
}

export const ensurePortainerApiToken = async () => {
    try {
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
    } catch (err) {
        console.error('Error ensurePortainerApiToken', err.message)
    }
}


const ensurePortainerSnapShotsOnFs = async () => {
    try {

        const portainerEnvironmentsSnapShotFromFile = (await fs.readJSON(`${portainerWrapperTmpFolderPath}/portainerEnvironmentsSnapShot.json`)) || {}
        if (portainerEnvironmentsSnapShotFromFile.timeStamp && moment(portainerEnvironmentsSnapShotFromFile.timeStamp).isAfter(moment().add("5", "minutes"))) {
            await ensuePortainerSnapShotEnvs()
        } else {
            portainerEnvironmentsSnapShot = {
                ...portainerEnvironmentsSnapShot,
                ...portainerEnvironmentsSnapShotFromFile,
            }
        }
    } catch (err) {
        console.error("Error: portainerEnvironmentsSnapShot ", err.message)
        await ensuePortainerSnapShotEnvs()
        //
    }
}

const ensureInfisicalProjectsSnapShotOnFs = async () => {

    try {
        const infisicalProjectsSnapShotFromFile = (await fs.readJSON(`${portainerWrapperTmpFolderPath}/infisicalProjectsSnapShot.json`)) || {}
        if (infisicalProjectsSnapShotFromFile.timeStamp && moment(infisicalProjectsSnapShotFromFile.timeStamp).isAfter(moment().add("5", "minutes"))) {
            await ensueInfisicalProjectsSnapShot()
        } else {
            infisicalProjectsSnapShot = {
                ...infisicalProjectsSnapShot,
                ...infisicalProjectsSnapShotFromFile,
            }
        }
    } catch (err) {
        console.error("Error: ensureInfisicalProjectsSnapShotOnFs ", err.message)
        await ensueInfisicalProjectsSnapShot()
    }
}

export const portainerExpressMiddlewareWrapper = (config: PortainerWrapperConfig) => {
    portainerUrl = config.portainerUrl
    portainerUserName = config.portainerUserName
    portainerPassword = config.portainerPassword
    portainerWrapperFolder = config.portainerWrapperFolder

    portainerWrapperTmpFolderPath = `${portainerWrapperFolder}/.~tmp`

    if (!fs.existsSync(portainerWrapperTmpFolderPath)) {
        fs.mkdirSync(portainerWrapperTmpFolderPath, { recursive: true })
    }
    //
    if (config?.s3BackupConfig?.accessKey) {
        s3BackupConfig = config?.s3BackupConfig
        configureS3Client(config.s3BackupConfig)
    }
    if (config?.infisicalConfig?.infisicalClientId) {
        infisicalConfig = config?.infisicalConfig
        configureInfisicalClient(config?.infisicalConfig);

        (async () => {
            await ensureInfisicalApiToken()
        })()

        if (infisicalConfig.refreshApiTokenIntervalSec > 0) {
            setInterval(async () => {
                try {
                    await ensureInfisicalApiToken()
                } catch (err) {
                    //
                }
            }, infisicalConfig.refreshApiTokenIntervalSec)
        }

        ensureInfisicalProjectsSnapShotOnFs();

    };


    ensurePortainerSnapShotsOnFs();



    if (config.refreshApiTokenIntervalSec > 0) {
        setInterval(async () => {
            try {
                await ensurePortainerApiToken()
            } catch (err) {
                //
            }
        }, config.refreshApiTokenIntervalSec)
    }



    return portainerExpressMiddleware
}
