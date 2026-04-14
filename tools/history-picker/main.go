package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

type row struct {
	BuildID    string `json:"buildId"`
	Status     string `json:"status"`
	PipeID     string `json:"pipeId"`
	App        string `json:"app"`
	Env        string `json:"env"`
	Branch     string `json:"branch"`
	Platform   string `json:"platform"`
	StartedAt  string `json:"startedAt"`
	Duration   string `json:"duration"`
	FailedTask string `json:"failedTask"`
}

type model struct {
	rows      []row
	status    string
	err       string
	rowStartY int
}

func main() {
	var dataPath string
	flag.StringVar(&dataPath, "data", "", "history data json path")
	flag.Parse()

	if dataPath == "" {
		fmt.Fprintln(os.Stderr, "missing --data")
		os.Exit(1)
	}

	payload, err := os.ReadFile(dataPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read data failed: %v\n", err)
		os.Exit(1)
	}

	var rows []row
	if err := json.Unmarshal(payload, &rows); err != nil {
		fmt.Fprintf(os.Stderr, "parse data failed: %v\n", err)
		os.Exit(1)
	}

	m := model{
		rows:      rows,
		status:    "点击任意一行即可复制 BuildId（按 q 或 esc 退出）",
		rowStartY: 4,
	}

	p := tea.NewProgram(m, tea.WithAltScreen(), tea.WithMouseCellMotion())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "picker failed: %v\n", err)
		os.Exit(1)
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch t := msg.(type) {
	case tea.KeyMsg:
		switch t.String() {
		case "q", "esc", "ctrl+c":
			return m, tea.Quit
		}
	case tea.MouseMsg:
		if t.Action != tea.MouseActionPress || t.Button != tea.MouseButtonLeft {
			return m, nil
		}

		idx := t.Y - m.rowStartY
		if idx < 0 || idx >= len(m.rows) {
			return m, nil
		}

		picked := m.rows[idx]
		if picked.BuildID == "" {
			m.err = "这行没有可复制的 BuildId"
			return m, nil
		}

		if err := copyToClipboard(picked.BuildID); err != nil {
			m.err = fmt.Sprintf("复制失败: %v", err)
			return m, nil
		}

		m.err = ""
		m.status = fmt.Sprintf("已复制 BuildId: %s", picked.BuildID)
	}

	return m, nil
}

func (m model) View() string {
	result := "History Picker\n"
	result += "\n"
	header := "BuildId         Status       PipeId                   App      Env      Branch     Platform  StartedAt   Duration FailedTask"
	result += header + "\n"
	result += strings.Repeat("-", len(header)) + "\n"

	for _, item := range m.rows {
		result += fmt.Sprintf("%-15s %-12s %-24s %-8s %-8s %-10s %-9s %-11s %-8s %s\n",
			truncate(item.BuildID, 15),
			truncate(item.Status, 12),
			truncate(item.PipeID, 24),
			truncate(item.App, 8),
			truncate(item.Env, 8),
			truncate(item.Branch, 10),
			truncate(item.Platform, 9),
			truncate(item.StartedAt, 11),
			truncate(item.Duration, 8),
			truncate(item.FailedTask, 20),
		)
	}

	result += "\n"
	if m.err != "" {
		result += m.err + "\n"
	} else {
		result += m.status + "\n"
	}

	return result
}

func truncate(input string, max int) string {
	if len(input) <= max {
		return input
	}
	if max <= 3 {
		return input[:max]
	}
	return input[:max-3] + "..."
}

func copyToClipboard(text string) error {
	if text == "" {
		return errors.New("empty buildId")
	}

	commands := [][]string{}
	switch runtime.GOOS {
	case "darwin":
		commands = [][]string{{"pbcopy"}}
	case "windows":
		commands = [][]string{{"cmd", "/c", "clip"}}
	default:
		commands = [][]string{{"wl-copy"}, {"xclip", "-selection", "clipboard"}, {"xsel", "--clipboard", "--input"}}
	}

	for _, parts := range commands {
		if len(parts) == 0 {
			continue
		}

		cmd := exec.Command(parts[0], parts[1:]...)
		stdin, err := cmd.StdinPipe()
		if err != nil {
			continue
		}

		if err := cmd.Start(); err != nil {
			_ = stdin.Close()
			continue
		}

		_, _ = stdin.Write([]byte(text))
		_ = stdin.Close()
		if err := cmd.Wait(); err == nil {
			return nil
		}
	}

	return errors.New("clipboard command unavailable")
}
