import React from "react"

import { Button, Checkbox, Radio, Form, Input, Modal, Select } from "antd"
import { apiCallAndReturnJson } from "../ui/Portainer"
import _ from "lodash"

const { Option } = Select

const DeployCommonTemplateModal = ({ portainerState, setPortainerState, componentState, setComponentState }) => {
    if (!componentState?.deployCommonTemplateModal?.isModalOpen) {
        return null
    }
    const [form] = Form.useForm()

    const onReset = () => {
        setComponentState((draft) => {
            draft.deployCommonTemplateModal = {
                isModalOpen: false,
            }
        })
        form.resetFields()
    }

    const templates = componentState?.commonTemplatesSnapShot?.templates || {}

    const template = {
        key: componentState?.deployCommonTemplateModal?.templateKey,
        ...templates[componentState?.deployCommonTemplateModal?.templateKey],
    }

    const stackName = template?.portainerWrapperMetadata?.stackName

    const availableEnvironments = []

    const envs = componentState?.portainerEnvironmentsSnapShot?.envs || {}

    Object.keys(envs).forEach((key) => {
        const environment = {
            key,
            ...envs[key],
        }
        if (environment.isSwarm) {
            return
        }

        const deployedStack = _.get(environment, `discoverStacks['${stackName}']`, {})
        const isStackAlreadyDeployed = !_.isEmpty(deployedStack)
        environment["isStackAlreadyDeployed"] = isStackAlreadyDeployed

        availableEnvironments.push(environment)
    })

    const selectedEnv = componentState?.deployCommonTemplateModal?.selectedEnv

    const selectedEnvToDeploy = _.get(envs, `['${selectedEnv}']`, {})
    const deployedStack = _.get(selectedEnvToDeploy, `discoverStacks['${stackName}']`, {})
    const isStackAlreadyDeployed = !_.isEmpty(deployedStack)
    const alreadyDeployedStackId = deployedStack?.Id

    return (
        <Modal
            //
            title={`Deploy ${stackName} into environment`}
            open={componentState?.deployCommonTemplateModal?.isModalOpen}
            onCancel={onReset}
            footer="">
            <Form
                name="basic"
                form={form}
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 16 }}
                style={{ maxWidth: 600, marginTop: "50px" }}
                initialValues={{ remember: true }}
                onFinish={() => {}}
                onFinishFailed={() => {}}
                autoComplete="off"
                //
            >
                <Form.Item name="Environment" label="Environment" rules={[{ required: true }]}>
                    <Radio.Group
                        onChange={(event) => {
                            setComponentState((draft) => {
                                draft.deployCommonTemplateModal.selectedEnv = event.target.value
                            })
                        }}>
                        {(availableEnvironments || []).map((env) => {
                            return (
                                <Radio value={env.key} key={`env_radio_${env.key}`}>
                                    {env.isStackAlreadyDeployed && "* "} {env.Name}
                                </Radio>
                            )
                        })}
                    </Radio.Group>
                </Form.Item>

                <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
                    {selectedEnv && (
                        <Button
                            type="primary"
                            htmlType="submit"
                            disabled={!selectedEnv}
                            onClick={async () => {
                                const res = await apiCallAndReturnJson("deployCommonTemplate", {
                                    method: "POST",
                                    body: JSON.stringify({
                                        selectedEnv: selectedEnv,
                                        templateKey: template.key,
                                        isStackAlreadyDeployed: isStackAlreadyDeployed,
                                        ...(alreadyDeployedStackId ? { alreadyDeployedStackId } : {}),
                                        stackName,
                                    }),
                                })
                                onReset()
                            }}>
                            {isStackAlreadyDeployed ? "Update" : "Submit"}
                        </Button>
                    )}
                    <Button htmlType="button" onClick={onReset}>
                        Reset
                    </Button>
                </Form.Item>
            </Form>
        </Modal>
    )
}

export default DeployCommonTemplateModal
