import React from "react"
import { useImmer } from "use-immer"
import PortainerEnvironments from "./PortainerEnvironments"
import InfisicalProjects from "./InfisicalProjects"
import CommonTemplates from "./CommonTemplates"

const componentsObj = {
    PortainerEnvironments,
    InfisicalProjects,
    CommonTemplates,
}

export const apiConfig = {
    portainerUrl: "",
    infisicalUrl: "",
    apiUrl: "",
    apiToken: "",
    apiTokenType: "",
    apiTokenKey: "",
}

export const apiCallAndReturnJson = async (url, options) => {
    try {
        options.headers = {
            ...options?.headers,
            "Content-Type": "application/json",
        }

        if (apiConfig.apiTokenType == "Bearer") {
            options.headers["Authorization"] = `Bearer ${apiConfig.apiToken}`
        }

        if (apiConfig.apiTokenType == "apiToken") {
            options.headers[apiConfig.apiTokenKey] = apiConfig.apiToken
        }

        const responseRaw = await fetch(`${apiConfig.apiUrl}/${url}`, {
            ...options,
            // credentials: "include",
        })

        const response = await responseRaw.json()

        return response
    } catch (error) {
        console.error("Error apiCallAndReturnJson", error)
        return {
            error: true,
            errorMessage: error.message,
        }
    }
}

export const PortainerContext = React.createContext({})

export const PortainerContextProvider = ({ children, config = {} }) => {
    apiConfig.apiUrl = config.apiUrl
    apiConfig.apiToken = config.apiToken
    apiConfig.apiTokenType = config.apiTokenType
    apiConfig.apiTokenKey = config.apiTokenKey
    apiConfig.portainerUrl = config.portainerUrl
    apiConfig.infisicalUrl = config.infisicalUrl

    const [portainerState, setPortainerState] = useImmer({
        config: config,
    })

    return (
        <PortainerContext.Provider
            //
            value={{ portainerState, setPortainerState }}
            //
        >
            {children}
        </PortainerContext.Provider>
    )
}

export const PortainerWrapper = ({ component = "PortainerEnvironments", config = {} }) => {
    const Component = componentsObj[component]

    return () => {
        return (
            <PortainerContextProvider config={config}>
                <Component />
            </PortainerContextProvider>
        )
    }
}
