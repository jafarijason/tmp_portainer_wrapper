import fetch from "node-fetch"
import { ensureInfisicalApiToken, ensureInfisicalProjectsSnapShotOnFs, infisicalConfig, infisicalProjectsSnapShot } from "./portainerExpressMiddleware";
import { ensueInfisicalProjectsSnapShot } from "./routesFn";
import _ from "lodash";

export const infisicalApiAndJsonResponse = async ({
    path,
    token,
    method,
    body = {}
}) => {

    try {
        const responseRaw = await fetch(
            //
            path,
            {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                ...(method != 'GET' ? { body: JSON.stringify(body) } : {}),
            });

        if (!responseRaw.ok) {
            console.log('path', path)
            console.log('body', body)
            throw new Error(`Failed  `)
        }
        const response = await responseRaw.json()

        return response
    } catch (err) {
        console.log(err.message)
        console.log("Error infisicalApiAndJsonResponse", err)
    }
}

export const ensureInfisicalProject = async ({
    project,
    env = 'live',
    secrets = {
        TEST1: 'asd'
    }
}) => {
    if(_.isEmpty(secrets)){
        throw new Error(`secrets is empty`)
    }
    await ensureInfisicalProjectsSnapShotOnFs()
    if (infisicalProjectsSnapShot?.projects[project]) {
        throw new Error(`project ${project} is already exist`)
    }
    const newProject: any = await infisicalApiAndJsonResponse({
        path: `${infisicalConfig.infisicalHostUrl}/api/v2/workspace`,
        token: await ensureInfisicalApiToken(),
        method: "POST",
        body: {
            projectName: project,
            // slug: slug || project
        },
    })
    await Promise.all((newProject?.project?.environments || []).map(async (env) => {

        return infisicalApiAndJsonResponse({
            path: `${infisicalConfig.infisicalHostUrl}/api/v1/workspace/${newProject?.project?.id}/environments/${env.id}`,
            token: await ensureInfisicalApiToken(),
            method: "DELETE",
            body: {},
        })
    }))

    const environment: any = await infisicalApiAndJsonResponse({
        path: `${infisicalConfig.infisicalHostUrl}/api/v1/workspace/${newProject?.project?.id}/environments`,
        token: await ensureInfisicalApiToken(),
        method: "POST",
        body: {
            name: env,
            slug: env,
        },
    })

    const body = {
        projectSlug: newProject?.project?.slug,
        workspaceId: environment.workspace,
        environment: env,
        secrets: [
            ...Object.keys(secrets).map((secretKey) => {
                return {
                    "secretKey": secretKey,
                    "secretValue": secrets[secretKey],
                    "skipMultilineEncoding": true,
                }
            })
        ]
    }


    const secret = await infisicalApiAndJsonResponse({
        path: `${infisicalConfig.infisicalHostUrl}/api/v3/secrets/batch/raw`,
        token: await ensureInfisicalApiToken(),
        method: "POST",
        body: body,
    })
}


export const deleteInfisicalProject = async (workspaceId) => {
    const result =  await infisicalApiAndJsonResponse({
        path: `${infisicalConfig.infisicalHostUrl}/api/v1/workspace/${workspaceId}`,
        token: await ensureInfisicalApiToken(),
        method: "DELETE",
        body: {},
    })

    await ensueInfisicalProjectsSnapShot(true)

    return result;
}