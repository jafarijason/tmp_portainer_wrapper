import React, { useContext, useEffect } from "react"
import { apiCallAndReturnJson, PortainerContext } from "./Portainer"
import { Button, Flex, Table, Tag, Typography, Modal, Radio, Select } from "antd"
import _ from "lodash"
import { useImmer } from "use-immer"
import moment from "moment-timezone"
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
                body: JSON.stringify({
                    forceFetch: true,
                }),
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
                        width: 1,
                    },
                    {
                        title: "Name",
                        dataIndex: "Name",
                        align: "center" as const,
                        width: 1,
                    },
                    {
                        title: "Type",
                        align: "center" as const,
                        width: 1,
                        render: (row) => {
                            const isSwarm = row.isSwarm
                            if (isSwarm) {
                                return <p>swarm</p>
                            }

                            return <p>standalone</p>
                        },
                    },
                    {
                        title: "Meta Data",
                        align: "center" as const,
                        width: 1,
                        render: (row) => {
                            const MetaData = _.cloneDeep(_.get(row, "Snapshots[0]", {}))
                            delete MetaData.Time
                            delete MetaData.DockerSnapshotRaw
                            delete MetaData.GpuUseList

                            return (
                                <div style={{ textAlign: "left", fontSize: "10px" }}>
                                    {Object.entries(MetaData).map(([key, value], index) => (
                                        <div key={`${row.Id}_${index}_${key}`}>
                                            {key}: {String(value)}
                                        </div>
                                    ))}
                                </div>
                            )
                            return <p>{JSON.stringify(MetaData)}</p>
                        },
                    },
                    {
                        title: "Number of Containers",
                        align: "center" as const,
                        width: 1,
                        render: (row) => <p>{_.get(row, "Snapshots[0].ContainerCount", "NA")}</p>,
                    },
                    {
                        title: "Snapshot time",
                        align: "center" as const,
                        width: 1,
                        render: (row) => (
                            <p>
                                {moment
                                    .unix(_.get(row, "Snapshots[0].Time", null))
                                    .tz("America/New_York")
                                    .format("MM-DD HH:mm")}
                            </p>
                        ),
                    },
                    {
                        title: "Manged by Portainer Containers",
                        align: "center" as const,
                        width: 2,
                        render: (row) => {
                            const portainerManageContainer = row?.portainerManageContainer || {}

                            return (
                                <div style={{ textAlign: "left" }}>
                                    No: {Object.keys(portainerManageContainer).length}
                                    {Object.entries(portainerManageContainer).map(([key, value], index) => {
                                        return (
                                            <div key={`${value.Id}_${index}_${key}`}>
                                                <a href={`${portainerState?.config?.portainerUrl}/#!/${row.Id}/docker/containers/${value.Id}`} target="_blank">
                                                    {value["name"]}
                                                </a>
                                                -
                                                <a href={`${portainerState?.config?.portainerUrl}/#!/${row.Id}/docker/containers/${value.Id}/logs`} target="_blank">
                                                    logs
                                                </a>
                                                -
                                                <a href={`${portainerState?.config?.portainerUrl}/#!/${row.Id}/docker/containers/${value.Id}/exec`} target="_blank">
                                                    shell
                                                </a>
                                                {" - "}
                                                Status: {value.Status}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        },
                    },
                    {
                        title: "Portainer",
                        align: "center" as const,
                        width: 1,
                        render: (row) => (
                            <Button
                                onClick={async () => {
                                    window.open(`${portainerState?.config?.portainerUrl}/#!/${row.Id}/docker/dashboard`, "_blank")
                                }}>
                                Open Dashboard
                            </Button>
                        ),
                    },
                    {
                        title: "Traefik",
                        width: 1,
                        align: "center" as const,
                        render: (row) => {
                            const portainerManageContainer = row?.portainerManageContainer || {}
                            let traefikContainer = {}
                            Object.keys(portainerManageContainer).forEach((containerId) => {
                                const container = portainerManageContainer[containerId]
                                if (traefikContainer?.Id) {
                                    return
                                }
                                if (container.Labels["portainer_isTraefik"]) {
                                    traefikContainer = container
                                }
                            })

                            const portainer_clusterDomain = traefikContainer?.Labels?.portainer_clusterDomain
                            const portainer_subdomain = traefikContainer?.Labels?.portainer_subdomain
                            if (!portainer_clusterDomain) {
                                return null
                            }
                            return (
                                <Button
                                    onClick={async () => {
                                        window.open(`https://${portainer_subdomain}.${portainer_clusterDomain}`, "_blank")
                                    }}
                                    //
                                >
                                    Open Dashboard
                                </Button>
                            )
                        },
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
