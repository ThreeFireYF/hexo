import { gql } from "@apollo/client";
import {
  Affix,
  Button,
  Modal,
  Space,
  Spin,
  TabsProps,
  message,
} from "antd";
import Card from "antd/lib/card/Card";
import { useRouter } from "next/router";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuid } from "uuid";

import {
  ProgrammeType,
  Stage,
  useProgrammeApplicationFormGetQuery,
  useProgrammeApplicationFormUpdateMutation,
} from "@/src/graphql/generated-types";
import { defaultApplicationFormStages } from "@/src/utils/applicationFormBuilder";
import { useGetLocalizedString, useProgrammeId } from "@/src/utils/hooks";

import DraggableTabs from "../DraggableTabs";
import EditableForm from "../EditableForm";
import StageTabRender from "../applicationForm/StageTabRender";

enum ManuallyDeleteAction {
  Edit = "edit",
  Cancel = "cancel",
}

type StageId = Stage["id"];
type FormField = {
  stages: Record<StageId, Stage>;
};

const PROGRAMME_APPLICATION_FORM_UPDATE = gql`
  mutation ProgrammeApplicationFormUpdate(
    $input: ProgrammeApplicationFormUpdateInput!
  ) {
    programmeApplicationFormUpdate(input: $input) {
      id
    }
  }
`;

export const ProgrammeTypeContext = createContext<ProgrammeType | undefined>(
  undefined,
);

export const useProgrammeType = () => useContext(ProgrammeTypeContext);

// Helper function to clean typename and value fields
const cleanQuestionData = (question: any, canScoring: boolean) => {
  delete question.title.__typename;
  delete question.title.value;
  delete question.hint.__typename;
  delete question.hint.value;
  delete question.__typename;

  if (question.optionList) {
    question.optionList.forEach((option) => {
      delete option.__typename;
      delete option.title?.__typename;
      delete option.title?.value;
      delete option.otherHint?.value;
      delete option.otherHint?.__typename;
      if (!canScoring) {
        delete option.score;
      }
    });
  }

  if (question.questionList) {
    question.questionList.forEach((nestedQuestion) => {
      delete nestedQuestion.__typename;
      delete nestedQuestion.title?.__typename;
      delete nestedQuestion.title?.value;
      delete nestedQuestion.hint?.__typename;
      delete nestedQuestion.hint?.value;

      if (nestedQuestion.questionList) {
        nestedQuestion.questionList.forEach((thirdQuestion) => {
          delete thirdQuestion.__typename;
          delete thirdQuestion.title?.__typename;
          delete thirdQuestion.title?.value;
          delete thirdQuestion.hint?.__typename;
          delete thirdQuestion.hint?.value;

          if (thirdQuestion.optionList) {
            thirdQuestion.optionList.forEach((option) => {
              delete option.__typename;
              delete option.otherHint?.__typename;
              delete option.otherHint?.value;
              delete option.title?.__typename;
              delete option.title?.value;
            });
          }
        });
      }

      if (nestedQuestion.optionList) {
        nestedQuestion.optionList.forEach((option) => {
          delete option.__typename;
          delete option.title?.__typename;
          delete option.title?.value;
          delete option.otherHint?.value;
          delete option.otherHint?.__typename;
        });
      }
    });
  }
};

// Helper function to filter stages based on programme type
const filterStagesByType = (type: ProgrammeType | undefined, resStageList: any[]) => {
  if (resStageList?.length > 0) {
    return resStageList;
  }

  if (type === ProgrammeType.Coupon) {
    return defaultApplicationFormStages.map((stage: any) => {
      if (stage.id === "stage_3") {
        return {
          ...stage,
          questionList: stage.questionList?.filter(
            (question) => question.id !== "question_3_1",
          ),
        };
      } else if (stage.id === "stage_4") {
        return {
          ...stage,
          questionList: stage.questionList?.map((question) => {
            if (question.id === "question_4_2") {
              return {
                ...question,
                questionList: question.questionList?.filter(
                  (q) => q.id !== "question_4_2_11",
                ),
              };
            }
            return question;
          }),
        };
      }
      return stage;
    });
  }

  return defaultApplicationFormStages;
};

const ApplicationFormBuilder = () => {
  const { t } = useTranslation();
  const getLocalizedString = useGetLocalizedString();
  const programmeId = useProgrammeId();
  const [form] = EditableForm.useForm<FormField>();
  const [showManualCancel, setShowManualCancel] = useState<boolean>(false);
  const router = useRouter();

  const itemsRef = useRef<TabsProps["items"]>([]);
  
  const [stageList, setStageList] = useState([]);
  const [activeKey, setActiveKey] = useState(undefined);
  const [order, setOrder] = useState<React.Key[]>([]);

  const { data, loading, refetch } = useProgrammeApplicationFormGetQuery({
    variables: {
      programmeIdList: [programmeId],
    },
    onCompleted: (data) => {
      const { stageList: resStageList } = data.programmeApplicationFormGet?.[0];
      const programmeType = data.programmeApplicationFormGet?.[0].programme.type;
      
      const stages = filterStagesByType(programmeType, resStageList);

      // Create tab items
      const newItems = stages.map((stage) => {
        const { id, name, canRemove } = stage;
        return {
          label: getLocalizedString(name),
          key: id,
          closable: canRemove,
          children: <StageTabRender stage={stage} />,
          forceRender: true,
        };
      });

      // Batch state updates
      itemsRef.current = newItems;
      setActiveKey(stages?.[0]?.id);
      setOrder(stages.map((stage) => stage.id));
      setStageList(stages);
    },
  });

  console.log(data);

  const [programmeApplicationFormUpdate, { loading: applicationFormUpdate }] =
    useProgrammeApplicationFormUpdateMutation();

  const onChange = useCallback((newActiveKey: string) => {
    setActiveKey(newActiveKey);
  }, []);

  const add = useCallback(() => {
    const newActiveKey = uuid();
    const newPanes = [...itemsRef.current];

    const newStage: Stage = {
      id: newActiveKey,
      canCreateBefore: true,
      canRemove: true,
      name: { en_us: "New Stage", zh_hk: "New Stage" },
      questionList: [],
    };

    const { id, name, canRemove } = newStage;

    // Always add panes before tnc stage
    newPanes.splice(newPanes?.length - 1, 0, {
      label: getLocalizedString(name),
      key: id,
      closable: canRemove,
      children: <StageTabRender stage={newStage} />,
      forceRender: true,
    });

    itemsRef.current = newPanes;
    setActiveKey(newActiveKey);
    setOrder(newPanes.map((item) => item.key));

    form.setFieldValue("stages", { ...form.getFieldValue("stages"), newStage });
  }, [form, getLocalizedString]);

  const remove = useCallback((targetKey: string) => {
    let newActiveKey = activeKey;
    let lastIndex = -1;
    itemsRef.current.forEach((item, i) => {
      if (item.key === targetKey) {
        lastIndex = i - 1;
      }
    });
    const newPanes = itemsRef.current.filter((item) => item.key !== targetKey);
    if (newPanes.length && newActiveKey === targetKey) {
      if (lastIndex >= 0) {
        newActiveKey = newPanes[lastIndex].key;
      } else {
        newActiveKey = newPanes[0].key;
      }
    }
    setActiveKey(newActiveKey);
    setOrder(newPanes.map((item) => item.key));
    itemsRef.current = newPanes;
    Modal.destroyAll();
  }, [activeKey]);

  const onRemoveManually = useCallback((action: ManuallyDeleteAction) => {
    if (action === ManuallyDeleteAction.Edit) {
      setShowManualCancel(true);
      const newPanesArr = itemsRef.current.map((items) => {
        return {
          ...items,
          closable: ["stage_2", "stage_3"].includes(items.key) ? false : true,
        };
      });
      itemsRef.current = newPanesArr;
    } else {
      router.reload();
    }
  }, [router]);

  const onEdit = useCallback((targetKey: string, action: "add" | "remove") => {
    if (action === "add") {
      add();
    } else {
      Modal.confirm({
        title: t("programmeDetail:applicationForm.sureToRemove"),
        content: t("programmeDetail:applicationForm.deletedContent"),
        onOk: () => remove(targetKey),
      });
    }
  }, [add, remove, t]);

  const initialValues: FormField = useMemo(() => {
    return {
      stages: stageList.reduce((acc, curr) => {
        acc[curr.id] = curr;
        return acc;
      }, {}),
    };
  }, [stageList]);

  useEffect(() => {
    if (initialValues) {
      setTimeout(() => {
        form.resetFields();
      }, 0);
    }

    const getCanDeleteItem = itemsRef.current?.filter(
      (item) =>
        !item?.key?.startsWith("stage") &&
        !item?.key?.startsWith("eligibility"),
    );
    if (getCanDeleteItem) {
      getCanDeleteItem.forEach((item) => (item.closable = true));
    }
  }, [form, initialValues]);

  const stages = EditableForm.useWatch(["stages"], form);
  console.log(stages, "---stages");

  const canMove = useCallback(
    (oldIndex, newIndex) => {
      const beforeStage = form.getFieldValue(["stages", itemsRef.current[oldIndex].key]);
      const afterStage = form.getFieldValue(["stages", itemsRef.current[newIndex].key]);

      // Fixed first and last stage before form submit
      const fixedStages = ["eligibility_stage_id", "stage_1", "stage_8"];
      if (
        fixedStages.includes(beforeStage?.id) ||
        fixedStages.includes(afterStage?.id)
      ) {
        return false;
      }

      return true;
    },
    [form],
  );

  const onSave = useCallback(async (data) => {
    const stageArr = [];

    if (data?.stages) {
      Object.values(data.stages).forEach((item: Stage) => {
        const stageObj = {
          id: item?.id,
          name: item?.name,
          canCreateBefore: true,
          canRemove: true,
          questionList: item.questionList,
          canScoring: item?.canScoring || false,
          canEditScoring: true,
        };

        if (item?.questionList) {
          item.questionList.forEach((question) => {
            cleanQuestionData(question, item?.canScoring || false);
          });
        }

        stageArr.push(stageObj);
      });
    }

    // Fixed first and last stage after form submit
    const getTncStageIndex = stageArr.findIndex(
      (stage) => stage?.id === "stage_8",
    );
    if (getTncStageIndex > -1) {
      const [getTncStage] = stageArr.splice(getTncStageIndex, 1);
      stageArr.push(getTncStage);
    }

    const getEligibilityStageIndex = stageArr.findIndex(
      (stage) =>
        stage?.id === "eligibility_stage_id" || stage?.id === "stage_1",
    );
    if (getEligibilityStageIndex > -1) {
      const [getEligibilityStage] = stageArr.splice(getEligibilityStageIndex, 1);
      stageArr.unshift(getEligibilityStage);
    }

    stageArr.sort((a, b) => {
      const indexA = order.indexOf(a.id);
      const indexB = order.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    const res = await programmeApplicationFormUpdate({
      variables: {
        input: {
          programmeId: programmeId,
          stage: stageArr,
        },
      },
      onError: () => {
        message.error(t("請輸入問題"));
        return;
      },
    });
    if (res?.data?.programmeApplicationFormUpdate?.id) {
      message.success(t("applicationForm:updateFormSuccess"));
      refetch();
    }
  }, [order, programmeApplicationFormUpdate, programmeId, refetch, t]);

  const onSaveFailed = useCallback((errors) => {
    const errorArr = errors?.errorFields;
    const getError = errorArr?.filter((error) => {
      return error?.errors?.length !== 0;
    });

    const getErrorName = errorArr?.map((error) => error?.name.slice(0, 2));

    const getErrorStageName = getErrorName?.map((title) =>
      form.getFieldValue([...title, "name", "zh_hk"]),
    );

    const uniqueStageName = getErrorStageName?.filter((ele, index) => {
      return getErrorStageName?.indexOf(ele) === index;
    });

    if (getError?.length > 1) {
      message.error(
        `${t("programmeDetail:globalError.checkZhEnInputMore")} ( ${t(
          `錯誤位於[${uniqueStageName.join(", ")}]`,
        )} )`,
        8,
      );
    } else {
      message.error(
        `${t("programmeDetail:globalError.checkZhEnInputOne")}  ( ${t(
          `錯誤位於[${uniqueStageName.join(", ")}]`,
        )} )`,
        8,
      );
    }

    errorArr.filter((error) => form.scrollToField(error?.name));
  }, [form, t]);

  const programmeType = useMemo(() => 
    data?.programmeApplicationFormGet?.[0]?.programme?.type,
    [data]
  );

  return (
    <ProgrammeTypeContext.Provider value={programmeType}>
      <Spin spinning={loading}>
        <EditableForm
          onFinish={onSave}
          onFinishFailed={onSaveFailed}
          layout="vertical"
          form={form}
          initialValues={initialValues}
          scrollToFirstError={{ behavior: "smooth", block: "center" }}
        >
          <Card
            title={t("programmeDetail:tabs.applicationForm")}
            extra={
              <Affix offsetTop={8}>
                <Space size={[8, 16]}>
                  <Button htmlType="submit" type="primary">
                    {t("common:save")}
                  </Button>

                  {showManualCancel ? (
                    <Button
                      htmlType="button"
                      onClick={() =>
                        onRemoveManually(ManuallyDeleteAction.Cancel)
                      }
                    >
                      {t("programmeDetail:applicationForm.cancelUpdateTab")}
                    </Button>
                  ) : (
                    <Button
                      htmlType="button"
                      onClick={() =>
                        onRemoveManually(ManuallyDeleteAction.Edit)
                      }
                    >
                      {t("programmeDetail:applicationForm.updateTab")}
                    </Button>
                  )}
                </Space>
              </Affix>
            }
          >
            <DraggableTabs
              type="editable-card"
              onChange={onChange}
              activeKey={activeKey}
              onEdit={onEdit}
              items={itemsRef.current}
              canMove={canMove}
              order={order}
              onOrderChange={setOrder}
              hideAdd={showManualCancel}
            />
          </Card>
        </EditableForm>
      </Spin>
    </ProgrammeTypeContext.Provider>
  );
};

export default ApplicationFormBuilder;
