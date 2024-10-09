import fetch from "node-fetch"

export const portainerApiAndJsonResponse = async ({ path, token, method, body = {} }) => {
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
                ...(method != "GET" ? { body: JSON.stringify(body) } : {}),
            }
        )

        // console.log(path)
        // debugger
        if (!responseRaw.ok) {
            throw new Error(`Failed portainerApiAndJsonResponse ${JSON.stringify(responseRaw)}`)
        }
        try {
            const response = await responseRaw.json()

            return response
        } catch (err) {
            try {
                const response = await responseRaw.text()

                return { type: "text", response }
            } catch (err2) {
                console.log('no response data available')
                // console.log("Error " + err)
                // console.log("Error2 " + err2)
            }
        }
    } catch (err) {
        console.log("Error portainerApiAndJsonResponse", err)
    }
}
