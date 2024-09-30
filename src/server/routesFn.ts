import moment from "moment"
import {
    ensurePortainerApiToken,
    portainerEnvironmentsSnapShot,
    portainerApiToken,
    portainerUrl,
    portainerWrapperTmpFolderPath,
    s3BackupConfig,
    uploadToS3,
    ensureInfisicalApiToken,
    infisicalApiToken,
    infisicalConfig,
    infisicalProjectsSnapShot,
    portainerWrapperFolder,
    commonTemplatesSnapShot,
} from "./portainerExpressMiddleware"
import { UnprocessableEntityException } from "@nestjs/common"
import { pipeline } from "stream"
import { promisify } from "util"

import fs from "fs-extra"
import { portainerApiAndJsonResponse } from "./portainerApi"
import { Router } from "express"
import { infisicalApiAndJsonResponse } from "./infisicalApi"
import * as YAML from 'js-yaml';
import _ from "lodash"

const pipelineAsync = promisify(pipeline)

export const portainerExpressMiddleware = Router()

portainerExpressMiddleware.get("/test", (req, res) => {
    res.send("Test endpoint is working!")
})

portainerExpressMiddleware.post("/backup", async (req, res) => {
    const isoTimeStamp = moment().toISOString()
    try {
        if (!s3BackupConfig?.accessKey) {
            throw new UnprocessableEntityException("s3 backup did not specified")
        }
        await ensurePortainerApiToken()

        // Path to save the tar.gz file
        const backupFilePath = `${portainerWrapperTmpFolderPath}/${isoTimeStamp}_encrypt.tar.gz`

        const backupResponse = await fetch(`${portainerUrl}/api/backup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${portainerApiToken}`,
            },
            body: JSON.stringify({
                password: s3BackupConfig.backupPassword || "",
            }),
        })

        if (!backupResponse.ok) {
            return res.status(backupResponse.status).json({
                message: "Failed to create backup",
                status: backupResponse.statusText,
            })
        }

        // Stream the backup content into a tar.gz file
        const backupFileStream = fs.createWriteStream(backupFilePath)
        await pipelineAsync(backupResponse.body, backupFileStream)

        // Upload the tar.gz file to S3
        const uploadResult = await uploadToS3(backupFilePath, s3BackupConfig)
        const s3FileUrl = uploadResult.Location

        await fs.unlink(backupFilePath)

        // Respond with the S3 file URL
        res.status(200).json({ message: "Backup stored in S3", fileUrl: s3FileUrl, isoTimeStamp })
    } catch (error) {
        res.status(500).json({ message: "Error creating or storing backup", error })
    }
})

export const ensuePortainerSnapShotEnvs = async (force = false) => {
    if (!force && portainerEnvironmentsSnapShot.timeStamp && moment().isBefore(moment(portainerEnvironmentsSnapShot.timeStamp).add('1', 'minutes'))) {
        return
    }
    try {
        await ensurePortainerApiToken()
        const snapShot: any = await portainerApiAndJsonResponse({
            path: `${portainerUrl}/api/endpoints`,
            token: portainerApiToken,
            method: "GET",
            body: {},
        })
        portainerEnvironmentsSnapShot.timeStamp = moment().toISOString()
        snapShot.forEach((env) => {
            portainerEnvironmentsSnapShot.envs[env.Name] = {
                ...env,
                timeStamp: portainerEnvironmentsSnapShot.timeStamp,
            }
        })
        await fs.writeFile(`${portainerWrapperTmpFolderPath}/portainerEnvironmentsSnapShot.json`, JSON.stringify(portainerEnvironmentsSnapShot, null, 4), "utf8")
        return snapShot
    } catch (err) {
        console.error("Error ensuePortainerSnapShotEnvs", err.message)
    }
}

portainerExpressMiddleware.post("/snapshotEnvs", async (req, res) => {
    const snapShot = await ensuePortainerSnapShotEnvs()
    // portainerEnvironmentsSnapShot.envsList = snapShot
    res.json(portainerEnvironmentsSnapShot)
})

export const ensueInfisicalProjectsSnapShot = async (force = false) => {
    if (!force && infisicalProjectsSnapShot.timeStamp && moment().isBefore(moment(infisicalProjectsSnapShot.timeStamp).add('5', 'minutes'))) {
        return
    }
    try {
        await ensureInfisicalApiToken()
        const snapShot: any = await infisicalApiAndJsonResponse({
            path: `${infisicalConfig.infisicalHostUrl}/api/v2/organizations/${infisicalConfig.infisicalOrganizationId}/workspaces`,
            token: infisicalApiToken,
            method: "GET",
            body: {},
        })
        infisicalProjectsSnapShot.timeStamp = moment().toISOString()
        snapShot?.workspaces?.forEach((project) => {
            const environmentsObj: any = {}
            project?.environments?.forEach((env) => {
                environmentsObj[env.slug] = env
            })
            infisicalProjectsSnapShot.projects[project.name] = {
                ...project,
                timeStamp: infisicalProjectsSnapShot.timeStamp,
                environmentsObj,
                numberOfEnvironments: project?.environments?.length,
            }
        })
        //
        await fs.writeFile(`${portainerWrapperTmpFolderPath}/infisicalProjectsSnapShot.json`, JSON.stringify(infisicalProjectsSnapShot, null, 4), "utf8")
        return snapShot
    } catch (err) {
        console.error("Error ensueInfisicalProjectsSnapShot", err.message)
    }
}

portainerExpressMiddleware.post("/infisicalProjectsSnapShot", async (req, res) => {
    const snapShot = await ensueInfisicalProjectsSnapShot()
    // portainerEnvironmentsSnapShot.envsList = snapShot
    res.json(infisicalProjectsSnapShot)
})

export const ensureCommonTemplatesSnapShot = async (force = false) => {

    if (!force && commonTemplatesSnapShot.timeStamp && moment().isBefore(moment(commonTemplatesSnapShot.timeStamp).add('5', 'minutes'))) {
        return
    }
    const commonTemplatesFolder = `${portainerWrapperFolder}/commonTemplates`


    const files = await fs.readdir(commonTemplatesFolder);
    const templatesFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));
    const templates = {}

    for (const templateFile of templatesFiles) {
        const templateContent = await fs.readFile(`${commonTemplatesFolder}/${templateFile}`, 'utf8');
        const templateObj: any = YAML.load(templateContent);
        const portainerWrapperMetadata = templateObj.portainerWrapperMetadata || {}
        delete templateObj.portainerWrapperMetadata
        Object.keys(templateObj.services).forEach((key)=> {
            const service = templateObj.services[key]
            const labelsSet = new Set(service?.labels || [])
            labelsSet.add(`portainer_commonTemplates=${templateFile}`)
            service.labels = [...labelsSet]
        })

        _.set(templates, `[${templateFile?.replace(/\./g, '__')}]`, {
            fileName: templateFile,
            templateName: portainerWrapperMetadata?.name,
            portainerWrapperMetadata,
            templateYaml: YAML.dump(templateObj, {})
        })

    }


    commonTemplatesSnapShot.timeStamp = moment().toISOString()
    commonTemplatesSnapShot.templates = templates

    await fs.writeFile(`${portainerWrapperTmpFolderPath}/commonTemplatesSnapShot.json`, JSON.stringify(commonTemplatesSnapShot, null, 4), "utf8")


    return commonTemplatesSnapShot
}

portainerExpressMiddleware.post("/commonTemplatesSnapShot", async (req, res) => {

    const snapShot = await ensureCommonTemplatesSnapShot()


    res.json(commonTemplatesSnapShot)
    // const snapShot = await ensueInfisicalProjectsSnapShot()
    // // portainerEnvironmentsSnapShot.envsList = snapShot
    // res.json(infisicalProjectsSnapShot)
})

