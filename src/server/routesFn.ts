import moment from "moment"
import {
    ensurePortainerApiToken,
    portainerEnvironmentsSnapShot,
    portainerUrl,
    portainerWrapperTmpFolderPath,
    s3BackupConfig,
    uploadToS3,
    ensureInfisicalApiToken,
    infisicalConfig,
    infisicalProjectsSnapShot,
    portainerWrapperFolder,
    commonTemplatesSnapShot,
    infisicalClient,
} from "./portainerExpressMiddleware"
import { UnprocessableEntityException } from "@nestjs/common"
import { pipeline } from "stream"
import { promisify } from "util"

import fs from "fs-extra"
import { portainerApiAndJsonResponse } from "./portainerApi"
import { Router } from "express"
import { infisicalApiAndJsonResponse } from "./infisicalApi"
import * as YAML from "js-yaml"
import _ from "lodash"

import nunjucks from "nunjucks"

nunjucks.configure({ autoescape: true })

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
                Authorization: `Bearer ${await ensurePortainerApiToken()}`,
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
    if (!force && portainerEnvironmentsSnapShot.timeStamp && moment().isBefore(moment(portainerEnvironmentsSnapShot.timeStamp).add("1", "minutes"))) {
        return
    }
    try {
        await portainerApiAndJsonResponse({
            path: `${portainerUrl}/api/endpoints/snapshot`,
            token: await ensurePortainerApiToken(),
            method: "POST",
            body: {},
        })
        // if(!_.isEmpty(portainerEnvironmentsSnapShot?.envs)){
        //     const envIds = Object.values(portainerEnvironmentsSnapShot?.envs).map((env)=> env.Id)
        //     console.log('envIds', envIds)
        //     await Promise.all(envIds.map((envId)=> portainerApiAndJsonResponse({
        //         path: `${portainerUrl}/api/endpoints/${envId}/snapshot`,
        //         token: portainerApiToken,
        //         method: "POST",
        //         body: {},
        //     })))
        // }
        const snapShot: any = await portainerApiAndJsonResponse({
            path: `${portainerUrl}/api/endpoints`,
            token: await ensurePortainerApiToken(),
            method: "GET",
            body: {},
        })
        portainerEnvironmentsSnapShot.envIdMaps = {}


        portainerEnvironmentsSnapShot.timeStamp = moment().toISOString()
        snapShot.forEach((env) => {
            const isSwarm = _.get(env, "Snapshots[0].Swarm", false)
            const isStandAlone = !isSwarm
            portainerEnvironmentsSnapShot.envs[env.Name] = {
                ...env,
                isSwarm,
                isStandAlone,
                portainerTags: [],
                tagToMetadataObj: {},
                timeStamp: portainerEnvironmentsSnapShot.timeStamp,
            }

            portainerEnvironmentsSnapShot.envIdMaps[env.Id] = env.Name
        })

        const envsMap = Object.keys(portainerEnvironmentsSnapShot?.envs).map((envKey) => {
            return {
                envKey,
                envId: portainerEnvironmentsSnapShot?.envs[envKey].Id,
            }
        })

        await Promise.all(
            envsMap.map(async (env) => {
                try {
                    const discoverInfo: any = await portainerApiAndJsonResponse({
                        path: `${portainerUrl}/api/endpoints/${env.envId}/docker/info`,
                        token: await ensurePortainerApiToken(),
                        method: "GET",
                        body: {},
                    })

                    _.set(portainerEnvironmentsSnapShot, `envs['${env.envKey}'].discoverInfo`, discoverInfo)
                } catch (err) {
                    console.log("Error discoverInfo", env, err)
                }
            })
        )
        await Promise.all(
            envsMap.map(async (env) => {
                try {
                    const discoverVersion: any = await portainerApiAndJsonResponse({
                        path: `${portainerUrl}/api/endpoints/${env.envId}/docker/version`,
                        token: await ensurePortainerApiToken(),
                        method: "GET",
                        body: {},
                    })

                    _.set(portainerEnvironmentsSnapShot, `envs['${env.envKey}'].discoverVersion`, discoverVersion)
                } catch (err) {
                    console.log("Error discoverVersion", env, err)
                }
            })
        )

        await Promise.all(
            envsMap.map(async (env) => {
                try {
                    const result: any =
                        (await portainerApiAndJsonResponse({
                            path: `${portainerUrl}/api/stacks?filters=%7B"EndpointID":${env.envId},"IncludeOrphanedStacks":true%7D`,
                            token: await ensurePortainerApiToken(),
                            method: "GET",
                            body: {},
                        })) || []

                    const discoverStacks: any = {}
                    result.forEach((stack) => {
                        discoverStacks[`${stack.Name}`] = stack
                    })

                    _.set(portainerEnvironmentsSnapShot, `envs['${env.envKey}'].discoverStacks`, discoverStacks)
                } catch (err) {
                    console.log("Error discoverStacks", env, err)
                }
            })
        )
        await Promise.all(
            envsMap.map(async (env) => {
                try {
                    const result: any =
                        (await portainerApiAndJsonResponse({
                            path: `${portainerUrl}/api/endpoints/${env.envId}/docker/containers/json?all=true`,
                            token: await ensurePortainerApiToken(),
                            method: "GET",
                            body: {},
                        })) || []

                    const discoverContainers: any = {}
                    result.forEach((container) => {
                        discoverContainers[`${container.Id}`] = container
                    })

                    const portainerManageContainer = {};
                    Object.keys(discoverContainers).forEach((containerId) => {
                        const container = discoverContainers[containerId]
                        if (container.State != "running") {
                            return
                        }
                        if (container.Labels["portainer_serviceName"]) {
                            portainerManageContainer[container?.Id] = {
                                name: container.Labels["portainer_serviceName"],
                                ...container,
                            }
                        }
                    })

                    _.set(portainerEnvironmentsSnapShot, `envs['${env.envKey}'].discoverContainers`, discoverContainers)
                    _.set(portainerEnvironmentsSnapShot, `envs['${env.envKey}'].portainerManageContainer`, portainerManageContainer)
                } catch (err) {
                    console.log("Error discoverContainers", env, err)
                }
            })
        )

        {

            const tags: any = await portainerApiAndJsonResponse({
                path: `${portainerUrl}/api/tags`,
                token: await ensurePortainerApiToken(),
                method: "GET",
                body: {},
            }) || []
            const tagsObj = {}
            tags.forEach((tag) => {
                const tagEnvs = Object.keys((tag?.Endpoints || {})).filter((envId) => !!tag?.Endpoints[envId]).map(envId => envId)
                const tagToMetadata = tag?.Name?.split('__')
                tag.tagToMetadataObj = {}
                if (tagToMetadata?.length == 2) {
                    tag.tagToMetadataObj[tagToMetadata[0]] = tagToMetadata[1]
                }
                tag.tagEnvs = tagEnvs
                tagsObj[tag.Name] = tag
                tagEnvs.forEach((envId) => {
                    const envKey = portainerEnvironmentsSnapShot.envIdMaps[envId]
                    const env = portainerEnvironmentsSnapShot.envs[envKey]
                    if (tagToMetadata?.length == 2) {
                        env.tagToMetadataObj = {
                            ...env.tagToMetadataObj,
                            ...tag.tagToMetadataObj
                        }
                    } else {
                        env.portainerTags.push(tag.Name)
                    }

                })
            })
            _.set(portainerEnvironmentsSnapShot, 'tagsObj', tagsObj)
        }



        await fs.writeFile(`${portainerWrapperTmpFolderPath}/portainerEnvironmentsSnapShot.json`, JSON.stringify(portainerEnvironmentsSnapShot, null, 4), "utf8")
        return snapShot
    } catch (err) {
        console.error("Error ensuePortainerSnapShotEnvs", err.message)
    }
}

portainerExpressMiddleware.post("/snapshotEnvs", async (req, res) => {
    const body = req.body || {}
    const snapShot = await ensuePortainerSnapShotEnvs(!!body?.forceFetch)
    // portainerEnvironmentsSnapShot.envsList = snapShot
    res.json(portainerEnvironmentsSnapShot)
})

export const ensueInfisicalProjectsSnapShot = async (force = false) => {
    if (!force && infisicalProjectsSnapShot.timeStamp && moment().isBefore(moment(infisicalProjectsSnapShot.timeStamp).add("5", "minutes"))) {
        return
    }
    try {
        const snapShot: any = await infisicalApiAndJsonResponse({
            path: `${infisicalConfig.infisicalHostUrl}/api/v2/organizations/${infisicalConfig.infisicalOrganizationId}/workspaces`,
            token: await ensureInfisicalApiToken(),
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
    if (!force && commonTemplatesSnapShot.timeStamp && moment().isBefore(moment(commonTemplatesSnapShot.timeStamp).add("5", "minutes"))) {
        return
    }
    const commonTemplatesFolder = `${portainerWrapperFolder}/commonTemplates`

    const files = await fs.readdir(commonTemplatesFolder)
    const templatesFiles = files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    const templates = {}

    for (const templateFile of templatesFiles) {
        const templateContent = await fs.readFile(`${commonTemplatesFolder}/${templateFile}`, "utf8")
        const templateObj: any = YAML.load(templateContent)
        const portainerWrapperMetadata = templateObj.portainerWrapperMetadata || {}
        delete templateObj.portainerWrapperMetadata
        Object.keys(templateObj.services).forEach((key) => {
            const service = templateObj.services[key]
            const labelsSet = new Set(service?.labels || [])
            labelsSet.add(`portainer_commonTemplates=${templateFile}`)
            service.labels = [...labelsSet]
        })

        _.set(templates, `[${templateFile?.replace(/\./g, "__")}]`, {
            fileName: templateFile,
            templateName: portainerWrapperMetadata?.name,
            portainerWrapperMetadata,
            templateYaml: YAML.dump(templateObj, {}),
        })
    }

    commonTemplatesSnapShot.timeStamp = moment().toISOString()
    commonTemplatesSnapShot.templates = templates

    await fs.writeFile(`${portainerWrapperTmpFolderPath}/commonTemplatesSnapShot.json`, JSON.stringify(commonTemplatesSnapShot, null, 4), "utf8")

    return commonTemplatesSnapShot
}

portainerExpressMiddleware.post("/commonTemplatesConfigAll", async (req, res) => {
    await Promise.all([
        ensureCommonTemplatesSnapShot(),
        ensueInfisicalProjectsSnapShot(),
        ensuePortainerSnapShotEnvs()
    ])

    res.json({
        commonTemplatesSnapShot,
        portainerEnvironmentsSnapShot,
        infisicalProjectsSnapShot,
    })
})

portainerExpressMiddleware.post("/deployCommonTemplate", async (req, res) => {
    const body = req.body
    const selectedEnv = body?.selectedEnv
    if (!selectedEnv) {
        throw new Error(`selectedEnv is not exist`)
    }

    const selectedEnvObj = _.get(portainerEnvironmentsSnapShot, `envs['${selectedEnv}']`, {})
    if (_.isEmpty(selectedEnvObj)) {
        throw new Error(`selectedEnv is not present in portainer`)
    }

    const isStackAlreadyDeployed = body.isStackAlreadyDeployed

    const templateKey = body?.templateKey
    if (!templateKey) {
        throw new Error(`templateKey is not exist`)
    }
    const template = _.get(commonTemplatesSnapShot, `templates[${templateKey}]`, {})
    if (_.isEmpty(template)) {
        throw new Error(`template not found`)
    }

    const portainerWrapperMetadata = template?.portainerWrapperMetadata
    const infisicalEnv = portainerWrapperMetadata?.infisicalEnv || "live"

    const infisicalProject = _.get(infisicalProjectsSnapShot, `projects[${selectedEnv}]`, {})
    const commonTemplateProject = _.get(infisicalProjectsSnapShot, `projects['${`commonTemplates_${template.fileName}`}']`, {})

    const [
        //
        infisicalPortainerEnv,
        commonTemplateSecretEnv,
    ] = await Promise.all([
        (async () => {
            try {
                return await infisicalClient.secrets().listSecrets({
                    environment: infisicalEnv,
                    projectId: infisicalProject.id,
                    expandSecretReferences: true,
                    includeImports: false,
                    recursive: false,
                })
            } catch (err) {
                console.log('Error infisicalPortainerEnv', err)
                return { secrets: [] }
            }
        })(),
        (async () => {
            try {
                return await infisicalClient.secrets().listSecrets({
                    environment: infisicalEnv,
                    projectId: commonTemplateProject.id,
                    expandSecretReferences: true,
                    includeImports: false,
                    recursive: false,
                })
            }
            catch (err) {
                console.log('Error commonTemplateSecretEnv', err)
                return { secrets: [] }
            }
        })(),
    ])

    // console.log(infisicalPortainerEnv,
    //     commonTemplateSecretEnv,)

    const portainerEnv: any = {};
    (infisicalPortainerEnv?.secrets || [])?.forEach((secret) => {
        portainerEnv[secret["secretKey"]] = secret["secretValue"]
    })
    const commonTemplateEnv: any = {};
    (commonTemplateSecretEnv?.secrets || [])?.forEach((secret) => {
        commonTemplateEnv[secret["secretKey"]] = secret["secretValue"]
    })

    template.key = templateKey
    const templateYaml = template.templateYaml
    const parsedTemplateYaml = nunjucks.renderString(templateYaml, {
        processEnv: process.env,
        portainerEnv,
        commonTemplateEnv,
    })

    if (isStackAlreadyDeployed) {
        const alreadyDeployedStackId = body.alreadyDeployedStackId
        if (!alreadyDeployedStackId) {
            throw new Error(`alreadyDeployedStackId is not exist`)
        }
        await portainerApiAndJsonResponse({
            path: `${portainerUrl}/api/stacks/${alreadyDeployedStackId}?endpointId=${selectedEnvObj?.Id}`,
            token: await ensurePortainerApiToken(),
            method: "PUT",
            body: {
                Env: [],
                Prune: false,
                PullImage: true,
                StackFileContent: parsedTemplateYaml,
                id: alreadyDeployedStackId,
            },
        })
    } else {
        const stackName = body.stackName
        if (!stackName) {
            throw new Error(`stackName is not exist`)
        }
        await portainerApiAndJsonResponse({
            path: `${portainerUrl}/api/stacks/create/standalone/string?endpointId=${selectedEnvObj?.Id}`,
            token: await ensurePortainerApiToken(),
            method: "POST",
            body: {
                Env: [],
                Name: stackName,
                StackFileContent: parsedTemplateYaml,
                method: "string",
                type: "standalone",
            },
        })
    }

    await Promise.all([
        //
        ensureCommonTemplatesSnapShot(true),
        ensueInfisicalProjectsSnapShot(true),
        ensuePortainerSnapShotEnvs(true)
    ])

    res.json({
        parsedTemplateYaml,
    })
})
