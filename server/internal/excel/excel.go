// Package excel builds and parses .xlsx workbooks for batch import and export.
package excel

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

const (
	maxParseRows    = 5000
	maxParseColumns = 40
)

// Sheet describes one worksheet: an optional watermark title row, one header row and the data rows.
type Sheet struct {
	Name           string
	Title          string
	Headers        []string
	Rows           [][]any
	Widths         []float64
	Validations    []Validation
	ValidationRows int
}

// Validation attaches a dropdown list to the given 1-based columns of the data area.
type Validation struct {
	Columns []int
	Options []string
}

// Build renders sheets into an xlsx document. The first sheet replaces the default one.
func Build(sheets []Sheet) ([]byte, error) {
	if len(sheets) == 0 {
		return nil, errors.New("excel: no sheets")
	}
	file := excelize.NewFile()
	for index, sheet := range sheets {
		name := strings.TrimSpace(sheet.Name)
		if name == "" {
			name = fmt.Sprintf("Sheet%d", index+1)
		}
		if index == 0 {
			if err := file.SetSheetName("Sheet1", name); err != nil {
				return nil, fmt.Errorf("rename sheet: %w", err)
			}
		} else if _, err := file.NewSheet(name); err != nil {
			return nil, fmt.Errorf("create sheet %q: %w", name, err)
		}
		if err := fillSheet(file, name, sheet); err != nil {
			return nil, err
		}
	}
	buffer, err := file.WriteToBuffer()
	if err != nil {
		return nil, fmt.Errorf("write workbook: %w", err)
	}
	return buffer.Bytes(), nil
}

func fillSheet(file *excelize.File, name string, sheet Sheet) error {
	headerStyle, err := file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "#FFFFFF", Size: 11},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#3370FF"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "middle", WrapText: true},
		Border:    cellBorder(),
	})
	if err != nil {
		return fmt.Errorf("header style: %w", err)
	}
	titleStyle, err := file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Italic: true, Color: "#8A94A6", Size: 10},
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "middle"},
	})
	if err != nil {
		return fmt.Errorf("title style: %w", err)
	}
	bodyStyle, err := file.NewStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Vertical: "top", WrapText: true},
		Border:    cellBorder(),
	})
	if err != nil {
		return fmt.Errorf("body style: %w", err)
	}

	row := 1
	lastColumn := columnLetter(max(len(sheet.Headers), longestRow(sheet.Rows)))
	if sheet.Title != "" {
		if err := file.MergeCell(name, "A1", lastColumn+"1"); err != nil {
			return fmt.Errorf("merge title: %w", err)
		}
		if err := file.SetCellStr(name, "A1", sheet.Title); err != nil {
			return fmt.Errorf("write title: %w", err)
		}
		if err := file.SetRowStyle(name, 1, 1, titleStyle); err != nil {
			return fmt.Errorf("style title: %w", err)
		}
		file.SetRowHeight(name, 1, 22)
		row = 2
	}

	headerRow := row
	for i, header := range sheet.Headers {
		cell, err := excelize.CoordinatesToCellName(i+1, headerRow)
		if err != nil {
			return fmt.Errorf("header cell: %w", err)
		}
		if err := file.SetCellStr(name, cell, header); err != nil {
			return fmt.Errorf("write header: %w", err)
		}
		if err := file.SetCellStyle(name, cell, cell, headerStyle); err != nil {
			return fmt.Errorf("style header: %w", err)
		}
	}
	file.SetRowHeight(name, headerRow, 24)
	row = headerRow + 1

	for _, values := range sheet.Rows {
		for i, value := range values {
			cell, err := excelize.CoordinatesToCellName(i+1, row)
			if err != nil {
				return fmt.Errorf("body cell: %w", err)
			}
			writeCell(file, name, cell, value)
			if err := file.SetCellStyle(name, cell, cell, bodyStyle); err != nil {
				return fmt.Errorf("style body: %w", err)
			}
		}
		row++
	}

	for i, width := range sheet.Widths {
		from, err := excelize.ColumnNumberToName(i + 1)
		if err != nil {
			continue
		}
		file.SetColWidth(name, from, from, width)
	}
	if len(sheet.Headers) > 0 {
		if err := file.SetPanes(name, &excelize.Panes{
			Freeze:      true,
			YSplit:      headerRow,
			TopLeftCell: fmt.Sprintf("A%d", headerRow+1),
			ActivePane:  "bottomLeft",
		}); err != nil {
			return fmt.Errorf("freeze header: %w", err)
		}
		if sheet.Validations != nil && sheet.ValidationRows > 0 {
			for _, spec := range sheet.Validations {
				validation := excelize.NewDataValidation(true)
				if err := validation.SetDropList(spec.Options); err != nil {
					return fmt.Errorf("drop list: %w", err)
				}
				validation.SetInput("请选择", "仅允许下拉列表中的取值")
				for _, column := range spec.Columns {
					letter, err := excelize.ColumnNumberToName(column)
					if err != nil {
						continue
					}
					validation.SetSqref(fmt.Sprintf("%s%d:%s%d", letter, headerRow+1, letter, headerRow+sheet.ValidationRows))
					if err := file.AddDataValidation(name, validation); err != nil {
						return fmt.Errorf("add validation: %w", err)
					}
				}
			}
		}
	}
	return nil
}

func cellBorder() []excelize.Border {
	gray := &excelize.Border{Type: "bottom", Color: "#DDE3EC", Style: 1}
	return []excelize.Border{*gray}
}

func writeCell(file *excelize.File, name, cell string, value any) {
	switch typed := value.(type) {
	case nil:
		_ = file.SetCellStr(name, cell, "")
	case string:
		_ = file.SetCellStr(name, cell, typed)
	case *string:
		if typed != nil {
			_ = file.SetCellStr(name, cell, *typed)
		}
	case time.Time:
		if typed.IsZero() {
			_ = file.SetCellStr(name, cell, "")
			return
		}
		_ = file.SetCellStr(name, cell, typed.Format("2006-01-02 15:04"))
	case *time.Time:
		if typed != nil {
			writeCell(file, name, cell, *typed)
		}
	case float64:
		_ = file.SetCellFloat(name, cell, typed, 2, 64)
	case float32:
		_ = file.SetCellFloat(name, cell, float64(typed), 2, 64)
	case int:
		_ = file.SetCellInt(name, cell, int64(typed))
	case int64:
		_ = file.SetCellInt(name, cell, typed)
	case bool:
		text := "否"
		if typed {
			text = "是"
		}
		_ = file.SetCellStr(name, cell, text)
	default:
		_ = file.SetCellStr(name, cell, fmt.Sprint(typed))
	}
}

// Table is a header-row worksheet read back from an upload.
type Table struct {
	Headers []string
	Rows    [][]string
	Header  int
}

// Parse reads the first worksheet that contains a header row matching one of the required titles.
// Rows above the header are ignored so users can add their own banner or notes.
func Parse(content []byte, required []string) (Table, error) {
	file, err := excelize.OpenReader(bytes.NewReader(content), excelize.Options{
		RawCellValue:      true,
		UnzipSizeLimit:    64 << 20,
		UnzipXMLSizeLimit: 16 << 20,
	})
	if err != nil {
		return Table{}, errors.New("文件无法解析，请使用系统提供的 .xlsx 模板")
	}
	defer file.Close()

	for _, name := range file.GetSheetList() {
		records, err := file.GetRows(name)
		if err != nil || len(records) == 0 {
			continue
		}
		headerIndex := findHeaderRow(records, required)
		if headerIndex < 0 {
			continue
		}
		headers := normalizeHeaders(records[headerIndex])
		rows := make([][]string, 0, len(records)-headerIndex-1)
		for _, record := range records[headerIndex+1:] {
			if len(record) > maxParseColumns {
				record = record[:maxParseColumns]
			}
			for len(record) < len(headers) {
				record = append(record, "")
			}
			if isBlankRow(record) {
				continue
			}
			rows = append(rows, record)
			if len(rows) > maxParseRows {
				return Table{}, fmt.Errorf("单次最多导入 %d 行，请拆分文件", maxParseRows)
			}
		}
		return Table{Headers: headers, Rows: rows, Header: headerIndex + 1}, nil
	}
	return Table{}, errors.New("未找到表头行，请确认包含列：" + strings.Join(required, "、"))
}

func findHeaderRow(records [][]string, required []string) int {
	limit := len(records)
	if limit > 10 {
		limit = 10
	}
	for index := 0; index < limit; index++ {
		cells := normalizeHeaders(records[index])
		matched := 0
		for _, want := range required {
			for _, cell := range cells {
				if cell == want {
					matched++
					break
				}
			}
		}
		if matched == len(required) && matched > 0 {
			return index
		}
	}
	return -1
}

func normalizeHeaders(row []string) []string {
	headers := make([]string, len(row))
	for i, cell := range row {
		cell = strings.TrimSpace(strings.ReplaceAll(cell, "＊", "*"))
		headers[i] = strings.TrimSuffix(cell, "*")
	}
	return headers
}

func isBlankRow(row []string) bool {
	for _, cell := range row {
		if strings.TrimSpace(cell) != "" {
			return false
		}
	}
	return true
}

func columnLetter(count int) string {
	if count < 1 {
		count = 1
	}
	letter, err := excelize.ColumnNumberToName(count)
	if err != nil {
		return "A"
	}
	return letter
}

func longestRow(rows [][]any) int {
	width := 0
	for _, row := range rows {
		if len(row) > width {
			width = len(row)
		}
	}
	return width
}
