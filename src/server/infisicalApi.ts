import fetch from "node-fetch"

export const infisicalApiAndJsonResponse = async ({
    path,
    token,
    method,
    body = {}
}) => {

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
        throw new Error(`Failed  `)
    }
    const response = await responseRaw.json()

    return response
}