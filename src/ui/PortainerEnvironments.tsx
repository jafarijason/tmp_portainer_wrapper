import React, { useContext, useEffect } from "react"
import { apiCallAndReturnJson, PortainerContext } from "./Portainer"
import { Button, Flex, Table, Tag, Typography, Modal, Radio, Select } from "antd"
import _ from "lodash"
import { useImmer } from "use-immer"
const { Text } = Typography

const PortainerEnvironments = () => {
    const { portainerState, setPortainerState } = useContext(PortainerContext)

    const [envs, setEnvs] = useImmer({
        data: [],
    })

    useEffect(() => {
        ;(async () => {
            const res = await apiCallAndReturnJson("snapshotEnvs", {
                method: "POST",
            })
            setEnvs((draft) => {
                draft.data = res
            })
        })()
    }, [])

    return (
        <Flex gap="middle" vertical>
            <Flex justify="center" style={{ marginTop: "20px" }}>
                <Text>
                    <b>Environments</b>
                </Text>
            </Flex>

            <Table
                size="small"
                columns={[
                    {
                        title: "Id",
                        dataIndex: "Id",
                        align: "center" as const,
                    },
                    {
                        title: "Name",
                        dataIndex: "Name",
                        align: "center" as const,
                    },
                    {
                        title: "Number of Containers",
                        align: "center" as const,
                        render: (row) => <p>{_.get(row, "Snapshots[0].ContainerCount", "NA")}</p>,
                    },
                    {
                        title: "Actions",
                        align: "center" as const,
                        render: (row) => (
                            <Button
                                onClick={async () => {
                                    window.open(`${portainerState?.config?.portainerUrl}/#!/${row.Id}/docker/dashboard`, "_blank")
                                    // await actions.impersonate({
                                    //     userId: row.id,
                                    // })
                                }}>
                                Open Dashboard
                            </Button>
                        ),
                    },
                ]}
                // pagination={true}
                loading={envs.data.length == 0}
                //@ts-ignore
                dataSource={(Object.values(envs.data?.envs || {}) || []).map((record) => ({ ...record, key: record.Id }))}
                pagination={{ pageSize: 15 }}
                // scroll={{ y: 240 }}
                sticky={{ offsetHeader: 5 }}
            />
        </Flex>
    )
}

export default PortainerEnvironments
