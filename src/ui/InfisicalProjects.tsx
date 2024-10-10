import React, { useContext, useEffect } from "react"
import { apiCallAndReturnJson, PortainerContext } from "./Portainer"
import { Button, Flex, Table, Tag, Typography, Modal, Radio, Select } from "antd"
import _ from "lodash"
import { useImmer } from "use-immer"
const { Text } = Typography

const InfisicalProjects = () => {
    const { portainerState, setPortainerState } = useContext(PortainerContext)

    const [apiDataState, setApiDataState] = useImmer({
        data: {},
        counter: 1,
    })

    useEffect(() => {
        ;(async () => {
            const res = await apiCallAndReturnJson("infisicalProjectsSnapShot", {
                method: "POST",
            })
            setApiDataState((draft) => {
                draft.data = res
            })
        })()
    }, [apiDataState.counter])

    const projects = apiDataState?.data?.projects || {}

    return (
        <Flex gap="middle" vertical>
            <Flex justify="center" style={{ marginTop: "20px" }}>
                <Text>
                    <b>Infisical Projects</b>
                </Text>
            </Flex>

            <Table
                size="small"
                columns={[
                    {
                        title: "id",
                        dataIndex: "id",
                        align: "center" as const,
                    },
                    {
                        title: "Name",
                        dataIndex: "name",
                        align: "center" as const,
                    },
                    {
                        title: "Envs",
                        align: "center" as const,
                        render: (row) => (
                            <p>
                                {Object.keys(row?.environmentsObj || {}).join(",")} {Object.keys(row?.environmentsObj || {}).length}
                            </p>
                        ),
                    },
                    {
                        title: "Actions",
                        align: "center" as const,
                        render: (row) => {
                            return (
                                <>
                                    <Button
                                        onClick={async () => {
                                            window.open(`${portainerState?.config?.infisicalUrl}/project/${row.id}/secrets/overview`, "_blank")
                                        }}>
                                        Open Project
                                    </Button>
                                    <Button
                                        onClick={async () => {
                                            // const res = await apiCallAndReturnJson("deleteInfisicalProject", {
                                            //     method: "POST",
                                            //     body: JSON.stringify({
                                            //         workspaceId: row.id,
                                            //     }),
                                            // })
                                            // setApiDataState((draft) => {
                                            //     draft.counter = draft.counter + 1
                                            // })
                                            console.log('disabled')
                                        }}>
                                        Delete Project
                                    </Button>
                                </>
                            )
                        },
                    },
                ]}
                // pagination={true}
                loading={Object.keys(projects)?.length == 0}
                //@ts-ignore
                dataSource={(Object.values(projects) || []).map((record) => ({ ...record, key: record.id }))}
                pagination={{ pageSize: 15 }}
                // scroll={{ y: 240 }}
                sticky={{ offsetHeader: 5 }}
            />
        </Flex>
    )
}

export default InfisicalProjects
