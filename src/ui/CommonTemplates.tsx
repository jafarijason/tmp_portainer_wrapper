import React, { useContext, useEffect } from "react"
import { apiCallAndReturnJson, PortainerContext } from "./Portainer"
import { Button, Flex, Table, Tag, Typography, Modal, Radio, Select } from "antd"
import _ from "lodash"
import { useImmer } from "use-immer"
import DeployCommonTemplateModal from "../components/DeployCommonTemplateModal"
const { Text } = Typography

const CommonTemplates = () => {
    const { portainerState, setPortainerState } = useContext(PortainerContext)

    const [componentState, setComponentState] = useImmer({
        commonTemplatesSnapShot: {},
        portainerEnvironmentsSnapShot: {},
        infisicalProjectsSnapShot: {},
        deployCommonTemplateModal: {
            isModalOpen: false,
        },
    })

    useEffect(() => {
        ;(async () => {
            const res = await apiCallAndReturnJson("commonTemplatesConfigAll", {
                method: "POST",
            })
            setComponentState((draft) => {
                draft.commonTemplatesSnapShot = res.commonTemplatesSnapShot
                draft.portainerEnvironmentsSnapShot = res.portainerEnvironmentsSnapShot
                draft.infisicalProjectsSnapShot = res.infisicalProjectsSnapShot
            })
        })()
    }, [])

    const templates = componentState?.commonTemplatesSnapShot?.templates || {}

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
                        title: "Type",
                        align: "center" as const,
                        render: (row) => {
                            return <p>{row?.portainerWrapperMetadata?.containerEnvType}</p>
                        },
                    },
                    {
                        title: "stackName",
                        align: "center" as const,
                        render: (row) => {
                            return <p>{row?.portainerWrapperMetadata?.stackName}</p>
                        },
                    },
                    {
                        title: "Actions",
                        align: "center" as const,
                        render: (row) => {
                            return (
                                <>
                                    <Button
                                        onClick={() => {
                                            setComponentState((draft) => {
                                                draft.deployCommonTemplateModal.isModalOpen = true
                                                draft.deployCommonTemplateModal.templateKey = row.key
                                            })
                                        }}>
                                        Deploy
                                    </Button>
                                </>
                            )
                        },
                    },
                ]}
                // pagination={true}
                loading={Object.keys(templates)?.length == 0}
                //@ts-ignore
                dataSource={(Object.keys(templates) || []).map((key) => {
                    const record = {
                        key,
                        ...templates[key],
                    }
                    return { ...record }
                })}
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

            <DeployCommonTemplateModal
                portainerState={portainerState}
                setPortainerState={setPortainerState}
                componentState={componentState}
                setComponentState={setComponentState}
            />
        </Flex>
    )
}

export default CommonTemplates
