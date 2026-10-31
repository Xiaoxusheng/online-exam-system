import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { createQuestion, updateQuestion } from '../../api/question';
import type { QuestionInput, QuestionPatch } from '../../api/question';
import { difficultyLabels, questionTypeLabels } from '../../utils/labels';
import { errorText } from '../../utils/errors';
import type { Question, QuestionType } from '../../types';

const SUBJECTIVE: QuestionType[] = ['short', 'essay', 'programming', 'media'];

const typeOptions = Object.entries(questionTypeLabels).map(
  ([value, label]) => ({ value, label }),
);
const difficultyOptions = Object.entries(difficultyLabels).map(
  ([value, label]) => ({ value, label }),
);
const languageOptions = ['go', 'python', 'javascript', 'java', 'cpp'].map(
  (value) => ({ value }),
);

interface FormValues {
  bank_id: string;
  type: QuestionType;
  difficulty: string;
  knowledge_point?: string;
  default_score: number;
  stem: string;
  options?: string[];
  correct?: string | string[];
  blanks?: string[][];
  reference?: string;
  rubric?: string;
  languages?: string[];
  starter_code?: string;
  cases?: { input?: string; output?: string; hidden?: boolean }[];
  mode?: string;
  partial_ratio?: boolean;
  ignore_case?: boolean;
  trim_space?: boolean;
}

function toFormValues(
  question: Question,
  banks: { value: string; label: string }[],
): FormValues {
  const content = (question.content ?? {}) as Record<string, unknown>;
  const answer = (question.answer ?? {}) as Record<string, unknown>;
  const rule = (question.score_rule ?? {}) as Record<string, unknown>;
  return {
    bank_id: question.bank_id || banks[0]?.value,
    type: question.type,
    difficulty: question.difficulty || 'medium',
    knowledge_point: question.knowledge_point,
    default_score: question.default_score,
    stem: typeof content.stem === 'string' ? content.stem : '',
    options: Array.isArray(content.options)
      ? (content.options as { text?: string }[]).map((item) => item.text ?? '')
      : [''],
    correct:
      question.type === 'multiple'
        ? ((answer.correct as string[]) ?? [])
        : Array.isArray(answer.correct)
          ? String(answer.correct[0])
          : undefined,
    blanks: Array.isArray(answer.answers)
      ? (answer.answers as string[][])
      : [['']],
    reference:
      typeof answer.reference === 'string' ? answer.reference : undefined,
    rubric: Array.isArray(answer.rubric)
      ? (answer.rubric as string[]).join('\n')
      : undefined,
    languages: Array.isArray(content.languages)
      ? (content.languages as string[])
      : ['go'],
    starter_code: undefined,
    cases: Array.isArray(content.cases)
      ? (content.cases as FormValues['cases'])
      : [],
    mode: typeof content.mode === 'string' ? content.mode : 'audio',
    partial_ratio: rule.partial === 'ratio',
    ignore_case: rule.ignore_case !== false,
    trim_space: rule.trim_space !== false,
  };
}

/** Option letters are derived from the row order so they can never drift apart. */
function toOptions(texts: string[] | undefined) {
  return (texts ?? []).map((text, index) => ({
    key: String.fromCharCode(65 + index),
    text,
  }));
}

function toPayload(values: FormValues): QuestionInput {
  const content: Record<string, unknown> = { stem: values.stem };
  const answer: Record<string, unknown> = {};
  const scoreRule: Record<string, unknown> = {};

  switch (values.type) {
    case 'single':
      content.options = toOptions(values.options);
      answer.correct = [values.correct as string];
      break;
    case 'multiple':
      content.options = toOptions(values.options);
      answer.correct = (values.correct as string[]) ?? [];
      if (values.partial_ratio) scoreRule.partial = 'ratio';
      break;
    case 'judge':
      answer.correct = [String(values.correct ?? 'true')];
      break;
    case 'fill':
      answer.answers = (values.blanks ?? []).map((blank) =>
        blank.filter((item) => item.trim() !== ''),
      );
      scoreRule.ignore_case = values.ignore_case !== false;
      scoreRule.trim_space = values.trim_space !== false;
      break;
    case 'programming':
      content.languages = values.languages ?? [];
      content.cases = (values.cases ?? []).map((item) => ({
        input: item.input ?? '',
        output: item.output ?? '',
        hidden: Boolean(item.hidden),
      }));
      content.starter_code =
        values.starter_code && values.languages?.length
          ? { [values.languages[0]]: values.starter_code }
          : {};
      if (values.reference) answer.reference = values.reference;
      break;
    case 'media':
      content.mode = values.mode ?? 'audio';
      if (values.reference) answer.reference = values.reference;
      break;
    default:
      if (values.reference) answer.reference = values.reference;
      if (values.rubric) {
        answer.rubric = values.rubric
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }
  }

  return {
    bank_id: values.bank_id,
    type: values.type,
    difficulty: values.difficulty,
    knowledge_point: values.knowledge_point?.trim() ?? '',
    default_score: values.default_score,
    content,
    answer,
    score_rule: scoreRule,
  };
}

interface QuestionEditorProps {
  open: boolean;
  question: Question | null;
  bankOptions: { value: string; label: string }[];
  onClose: () => void;
}

const BLANK_DEFAULTS: FormValues = {
  bank_id: '',
  type: 'single',
  difficulty: 'medium',
  default_score: 2,
  stem: '',
  options: ['', ''],
  blanks: [['']],
  languages: ['go'],
  cases: [],
  mode: 'audio',
  partial_ratio: true,
  ignore_case: true,
  trim_space: true,
};

/**
 * Mounted once per drawer opening, so a previously edited question can never
 * leave its values behind in the next form.
 */
function QuestionForm({
  question,
  bankOptions,
  onSaved,
  onCancel,
}: {
  question: Question | null;
  bankOptions: { value: string; label: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const initial = useMemo<FormValues>(
    () =>
      question
        ? toFormValues(question, bankOptions)
        : { ...BLANK_DEFAULTS, bank_id: bankOptions[0]?.value ?? '' },
    [question, bankOptions],
  );
  const type = Form.useWatch('type', form);
  const watchedOptions = Form.useWatch('options', form);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = toPayload(values);
      if (question) {
        // A question cannot be moved between banks, so the patch omits bank_id.
        const patch: QuestionPatch = {
          type: payload.type,
          difficulty: payload.difficulty,
          knowledge_point: payload.knowledge_point,
          default_score: payload.default_score,
          content: payload.content,
          answer: payload.answer,
          score_rule: payload.score_rule,
        };
        return updateQuestion(question.id, patch);
      }
      return createQuestion(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['question'] });
      message.success(question ? '题目已保存，版本号 +1' : '题目已创建');
      onSaved();
    },
    onError: (error) => message.error(errorText(error)),
  });

  const choiceOptions = useMemo(
    () =>
      (watchedOptions ?? []).map((text, index) => ({
        value: String.fromCharCode(65 + index),
        label: `${String.fromCharCode(65 + index)}. ${text || '（未填写）'}`,
      })),
    [watchedOptions],
  );

  async function submit() {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      message.warning('请先补全必填项');
      return;
    }
    if (values.type === 'multiple') {
      const picked = (values.correct as string[]) ?? [];
      if (picked.length < 2) {
        message.warning('多选题至少选择两个正确答案');
        return;
      }
    }
    mutation.mutate(values);
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initial}
      className="question-form"
    >
      <div className="form-grid">
        <Form.Item
          name="bank_id"
          label="所属题库"
          rules={[{ required: true, message: '请选择题库' }]}
        >
          <Select
            options={bankOptions}
            disabled={Boolean(question)}
            placeholder="选择题库"
          />
        </Form.Item>
        <Form.Item name="type" label="题型" rules={[{ required: true }]}>
          <Select options={typeOptions} disabled={Boolean(question)} />
        </Form.Item>
      </div>

      <div className="form-grid">
        <Form.Item name="difficulty" label="难度" rules={[{ required: true }]}>
          <Select options={difficultyOptions} />
        </Form.Item>
        <Form.Item
          name="default_score"
          label="默认分值（分）"
          rules={[{ required: true, message: '请填写分值' }]}
        >
          <InputNumber
            min={0.5}
            max={100}
            step={0.5}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </div>

      <Form.Item
        name="knowledge_point"
        label="知识点"
        rules={[{ max: 60, message: '知识点不超过 60 个字符' }]}
      >
        <Input placeholder="如：HTTP 状态码" />
      </Form.Item>

      <Form.Item
        name="stem"
        label="题干"
        rules={[{ required: true, message: '请填写题干' }]}
      >
        <Input.TextArea
          rows={3}
          placeholder="题目正文，填空题用 ____ 标记空位"
        />
      </Form.Item>

      {(type === 'single' || type === 'multiple') && (
        <>
          <Form.Item label="选项" required tooltip="选项编号自动生成，可增删">
            <Form.List name="options">
              {(fields, { add, remove }) => (
                <div className="option-editor">
                  {fields.map((field, index) => (
                    <Space
                      key={field.key}
                      align="baseline"
                      className="option-row"
                    >
                      <span className="option-key">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <Form.Item
                        name={field.name}
                        rules={[
                          { required: true, message: '选项内容不能为空' },
                        ]}
                        style={{ marginBottom: 0, minWidth: 420 }}
                      >
                        <Input placeholder="选项内容" />
                      </Form.Item>
                      {fields.length > 2 && (
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label="删除选项"
                          onClick={() => {
                            remove(field.name);
                            // Letters shift with the rows, so a stale selection must be re-picked.
                            form.setFieldValue('correct', undefined);
                          }}
                        />
                      )}
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add('')}
                  >
                    添加选项
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item
            name="correct"
            label="正确答案"
            rules={[{ required: true, message: '请标记正确答案' }]}
            extra={
              type === 'multiple'
                ? '少选可按比例给分，错选按 0 分处理'
                : undefined
            }
          >
            {type === 'single' ? (
              <Select options={choiceOptions} placeholder="选择正确选项" />
            ) : (
              <Select
                mode="multiple"
                options={choiceOptions}
                placeholder="选择多个正确选项"
              />
            )}
          </Form.Item>

          {type === 'multiple' && (
            <Form.Item
              name="partial_ratio"
              label="少选按比例给分"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          )}
        </>
      )}

      {type === 'judge' && (
        <Form.Item
          name="correct"
          label="正确答案"
          rules={[{ required: true, message: '请选择判断结果' }]}
        >
          <Select
            options={[
              { value: 'true', label: '正确' },
              { value: 'false', label: '错误' },
            ]}
          />
        </Form.Item>
      )}

      {type === 'fill' && (
        <>
          <Form.Item
            label="空位答案"
            required
            tooltip="每个空可填写多个等价答案，用「添加等价答案」追加"
          >
            <Form.List name="blanks">
              {(fields, { add, remove }) => (
                <div className="blank-editor">
                  {fields.map((field, index) => (
                    <div className="blank-row" key={field.key}>
                      <span className="option-key">空 {index + 1}</span>
                      <Form.List name={[field.name]}>
                        {(answers, answerApi) => (
                          <Space align="baseline" wrap>
                            {answers.map((answer) => (
                              <Form.Item
                                key={answer.key}
                                name={answer.name}
                                style={{ marginBottom: 0 }}
                                rules={[
                                  { required: true, message: '答案不能为空' },
                                ]}
                              >
                                <Input
                                  placeholder="如：北京"
                                  style={{ width: 140 }}
                                />
                              </Form.Item>
                            ))}
                            <Button
                              type="link"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={() => answerApi.add('')}
                            >
                              等价答案
                            </Button>
                          </Space>
                        )}
                      </Form.List>
                      {fields.length > 1 && (
                        <Button
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                          aria-label="删除空位"
                        />
                      )}
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add([''])}
                  >
                    添加空位
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>
          <div className="form-grid">
            <Form.Item
              name="ignore_case"
              label="忽略大小写"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              name="trim_space"
              label="忽略首尾空格"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>
        </>
      )}

      {type === 'programming' && (
        <>
          <Form.Item
            name="languages"
            label="允许语言"
            rules={[{ required: true, message: '至少选择一种语言' }]}
          >
            <Select
              mode="multiple"
              options={languageOptions}
              placeholder="如：go、python"
            />
          </Form.Item>
          <Form.Item
            label="测试用例"
            tooltip="隐藏用例不会下发给考生，仅服务端判分使用"
          >
            <Form.List name="cases">
              {(fields, { add, remove }) => (
                <div className="blank-editor">
                  {fields.map((field) => (
                    <div className="case-row" key={field.key}>
                      <Form.Item
                        name={[field.name, 'input']}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="输入" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'output']}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="期望输出" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'hidden']}
                        valuePropName="checked"
                        style={{ marginBottom: 0 }}
                      >
                        <Switch
                          checkedChildren="隐藏"
                          unCheckedChildren="样例"
                        />
                      </Form.Item>
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                        aria-label="删除用例"
                      />
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({ input: '', output: '', hidden: false })
                    }
                  >
                    添加用例
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item
            name="starter_code"
            label="代码模板"
            extra="作用于所选语言的第一项"
          >
            <Input.TextArea rows={4} placeholder="function solve() {}" />
          </Form.Item>
        </>
      )}

      {type === 'media' && (
        <Form.Item name="mode" label="作答形式">
          <Select
            options={[
              { value: 'audio', label: '口头作答（录音）' },
              { value: 'video', label: '视频作答' },
            ]}
          />
        </Form.Item>
      )}

      {SUBJECTIVE.includes(type as QuestionType) && (
        <>
          <Form.Item name="reference" label="参考答案">
            <Input.TextArea rows={3} placeholder="用于阅卷教师对照，可留空" />
          </Form.Item>
          {type !== 'programming' && type !== 'media' && (
            <Form.Item
              name="rubric"
              label="评分要点"
              extra="每行一条，阅卷时按要点给分"
            >
              <Input.TextArea
                rows={3}
                placeholder={'身份核验\n过程监考\n事后复核'}
              />
            </Form.Item>
          )}
        </>
      )}

      {type === 'programming' && (
        <Form.Item name="reference" label="参考解法说明">
          <Input.TextArea rows={3} placeholder="可留空" />
        </Form.Item>
      )}

      <div className="drawer-actions">
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" loading={mutation.isPending} onClick={submit}>
          保存
        </Button>
      </div>
    </Form>
  );
}

export default function QuestionEditor({
  open,
  question,
  bankOptions,
  onClose,
}: QuestionEditorProps) {
  return (
    <Drawer
      open={open}
      width={720}
      title={question ? `编辑题目 · v${question.version}` : '新建题目'}
      onClose={onClose}
      destroyOnHidden
    >
      {open ? (
        <QuestionForm
          question={question}
          bankOptions={bankOptions}
          onSaved={onClose}
          onCancel={onClose}
        />
      ) : null}
    </Drawer>
  );
}
