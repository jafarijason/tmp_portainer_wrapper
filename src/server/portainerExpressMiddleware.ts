import { Router } from "express"
import fetch from "node-fetch"
import jwt from "jsonwebtoken"

interface PortainerWrapperConfig {
    portainerUrl: string
    portainerUserName: string
    portainerPassword: string
}

let portainerUrl = ""
let portainerUserName = ""
let portainerPassword = ""
let portainerApiToken = ""
let portainerApiTokenPayload: any = {}

const portainerExpressMiddleware = Router()

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

    const response = await responseRaw.json()
    portainerApiToken = response?.jwt
    portainerApiTokenPayload = jwt.decode(portainerApiToken)

    return portainerApiToken
}

export const portainerExpressMiddlewareWrapper = (config: PortainerWrapperConfig) => {
    portainerUrl = config.portainerUrl
    portainerUserName = config.portainerUserName
    portainerPassword = config.portainerPassword

    setInterval(async () => {
        await ensurePortainerApiToken()
    }, 4000)

    return portainerExpressMiddleware
}
