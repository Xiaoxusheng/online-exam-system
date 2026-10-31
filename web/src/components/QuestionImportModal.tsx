import { useState } from 'react'
import { App, Alert, Button, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import { DownloadOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons'
import { errorText } from '../utils/errors'
import { downloadQuestionTemplate, importQuestions, type ImportReportRow, type ImportResult } from '../api/question'
import type { QuestionBank } from '../types'

const { Paragraph } = Typography

interface Props {
  open: boolean
  banks: QuestionBank[]
  onClose: () => void
  onImported: () => void
}

const statusMeta: Record<string, { label: string; color: string }> = {
  created: { label: '已导入', color: 'green' },
  skipped: { label: '已跳过', color: 'orange' },
  failed: { label: '失败', color: 'red' },
}

/** Batch question import: pick a bank, upload the workbook, review the per-row report. */
export default function QuestionImportModal({ open, banks, onClose, onImported }: Props) {
  const { message } = App.useApp()
  const [bankId, setBankId] = useState<string>()
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function downloadTemplate() {
    setDownloading(true)
    try {
      await downloadQuestionTemplate()
    } catch (error) {
      message.error(errorText(error))
    } finally {
      setDownloading(false)
    }
  }

  function reset() {
    setBankId(undefined)
    setFile(null)
    setResult(null)
    setPending(false)
  }

  async function submit() {
    if (!bankId) {
      message.warning('请先选择要导入的题库')
      return
    }
    if (!file) {
      message.warning('请先选择 Excel 文件')
      return
    }
    setPending(true)
    try {
      const data = await importQuestions(bankId, file)
      setResult(data)
      onImported()
      if (data.created > 0) {
        message.success(`已导入 ${data.created} 道题目`)
      } else {
        message.warning('没有题目写入，请查看错误报告')
      }
    } catch (error) {
      message.error(errorText(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      title="批量导入题目"
      width={780}
      destroyOnHidden
      onCancel={() => {
        reset()
        onClose()
      }}
      footer={
        result ? (
          <Button
            onClick={() => {
              reset()
              onClose()
            }}
          >
            完成
          </Button>
        ) : (
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" icon={<UploadOutlined />} loading={pending} onClick={submit}>
              开始导入
            </Button>
          </Space>
        )
      }
    >
      {result ? (
        <ImportReport result={result} />
      ) : (
        <div className="import-flow">
          <Paragraph type="secondary" className="import-hint">
            按模板填写后上传 .xlsx。单次最多 1000 行；题干与库内已有题目完全相同时自动跳过，可重复上传同一个文件。
          </Paragraph>
          <Space direction="vertical" size={12} className="import-fields">
            <Select
              size="large"
              placeholder="选择题库"
              style={{ width: '100%' }}
              value={bankId}
              onChange={setBankId}
              options={banks.map((bank) => ({ value: bank.id, label: `${bank.name}（${bank.question_count} 题）` }))}
            />
            <div
              className="drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const dropped = event.dataTransfer.files?.[0]
                if (dropped) setFile(dropped)
              }}
            >
              <InboxOutlined className="drop-icon" />
              <div className="drop-text">{file ? file.name : '把 Excel 拖到这里，或点击右侧按钮选择文件'}</div>
              <Space size={8}>
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => document.getElementById('question-import-file')?.click()}
                >
                  选择文件
                </Button>
                <Button type="link" icon={<DownloadOutlined />} loading={downloading} onClick={downloadTemplate}>
                  下载模板
                </Button>
              </Space>
              <input
                id="question-import-file"
                type="file"
                accept=".xlsx"
                hidden
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </Space>
        </div>
      )}
    </Modal>
  )
}

function ImportReport({ result }: { result: ImportResult }) {
  const summary = [
    { label: '数据行', value: result.total },
    { label: '已导入', value: result.created, tone: 'good' },
    { label: '自动发布', value: result.published },
    { label: '跳过', value: result.skipped, tone: 'warn' },
    { label: '失败', value: result.failed, tone: result.failed ? 'bad' : undefined },
  ]
  return (
    <div className="import-report">
      <Alert
        type={result.failed || result.skipped ? 'warning' : 'success'}
        showIcon
        message={`已导入目标题库「${result.bank_name}」`}
        description={
          result.failed
            ? '失败与跳过的行不会写入，修正后可以再次上传同一文件。'
            : '全部有效行已写入，可在列表中继续编辑或发布。'
        }
      />
      <div className="report-metrics">
        {summary.map((item) => (
          <div key={item.label} className={`report-metric ${item.tone ?? ''}`}>
            <span className="report-metric-label">{item.label}</span>
            <span className="report-metric-value">{item.value}</span>
          </div>
        ))}
      </div>
      <Table<ImportReportRow>
        rowKey={(row) => `${row.line}-${row.status}`}
        size="small"
        dataSource={result.report}
        pagination={result.report.length > 8 ? { pageSize: 8, size: 'small' } : false}
        columns={[
          { title: '行号', dataIndex: 'line', width: 70 },
          {
            title: '题干',
            dataIndex: 'stem',
            ellipsis: true,
            render: (value: string) => value || <span className="cell-meta">（空）</span>,
          },
          {
            title: '结果',
            dataIndex: 'status',
            width: 96,
            render: (value: string) => {
              const meta = statusMeta[value] ?? { label: value, color: 'default' }
              return <Tag color={meta.color}>{meta.label}</Tag>
            },
          },
          { title: '说明', dataIndex: 'message', width: 240, render: (value: string) => value || '—' },
        ]}
      />
    </div>
  )
}
