import React, { useContext, useEffect } from "react"
import { apiCallAndReturnJson, PortainerContext } from "./Portainer"

const PortainerEnvironments = () => {
    const { portainerState, setPortainerState } = useContext(PortainerContext)

    useEffect(() => {
        ;(async () => {
            const res = await apiCallAndReturnJson("snapshot", {})
            console.log("asdasd")
        })()
    }, [])

    console.log(portainerState)

    return <h1>Env</h1>
}

export default PortainerEnvironments
