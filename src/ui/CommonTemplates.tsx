import React, { useContext, useEffect } from "react"
import { apiCallAndReturnJson, PortainerContext } from "./Portainer"
import { Button, Flex, Table, Tag, Typography, Modal, Radio, Select } from "antd"
import _ from "lodash"
import { useImmer } from "use-immer"
const { Text } = Typography

const CommonTemplates = () => {
    const { portainerState, setPortainerState } = useContext(PortainerContext)

    const [apiDataState, setApiDataState] = useImmer({
        data: {},
    })

    useEffect(() => {
        ;(async () => {
            const res = await apiCallAndReturnJson("commonTemplatesSnapShot", {
                method: "POST",
            })
            setApiDataState((draft) => {
                draft.data = res
            })
        })()
    }, [])

    const templates = apiDataState?.data?.templates || {}


    return (
        <Flex gap="middle" vertical>
            <Flex justify="center" style={{ marginTop: "20px" }}>
                <Text>
                    <b>Common templates</b>
                </Text>
            </Flex>

            <Table
                size="small"
                columns={[
                    {
                        title: "fileName",
                        dataIndex: "fileName",
                        align: "center" as const,
                    },
                    {
                        title: "Name",
                        dataIndex: "templateName",
                        align: "center" as const,
                    },
                    {
                        title: "Actions",
                        align: "center" as const,
                        render: (row) => {
                            return (
                                <></>
                                // <Button
                                //     onClick={async () => {
                                //         window.open(`${portainerState?.config?.infisicalUrl}/project/${row.id}/secrets/overview`, "_blank")
                                //     }}>
                                //     Open Project
                                // </Button>
                            )
                        },
                    },
                ]}
                // pagination={true}
                loading={Object.keys(templates)?.length == 0}
                //@ts-ignore
                dataSource={(Object.values(templates) || []).map((record) => ({ ...record, key: record.id }))}
                pagination={{ pageSize: 15 }}
                // scroll={{ y: 240 }}
                sticky={{ offsetHeader: 5 }}
                expandable={{
                    rowExpandable: (record) => record.fileName !== "Not Expandable",
                    // expandRowByClick: true,
                    // expandIcon: () => <div />,
                    columnWidth: 1,
                    expandedRowRender: (record) => {
                        console.log(record)
                        return (
                            <Flex
                                //
                                vertical
                                style={{ width: "100% !important" }}
                                //
                            >
                                <pre style={{ width: "100% !important" }}>{record?.templateYaml}</pre>
                            </Flex>
                        )
                    },
                    fixed: "left",
                }}
            />
        </Flex>
    )
}

export default CommonTemplates
