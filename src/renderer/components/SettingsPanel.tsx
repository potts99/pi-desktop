import { useState, useEffect, useCallback } from "react";

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: "text" | "select" | "toggle" | "number" | "textarea";
  options?: { value: string; label: string }[];
  placeholder?: string;
}

const sections: { title: string; fields: SettingField[] }[] = [
  {
    title: "Model defaults",
    fields: [
      { key: "defaultProvider", label: "Default provider", description: "Provider used for new agents", type: "text", placeholder: "zai" },
      { key: "defaultModel", label: "Default model", description: "Model used for new agents", type: "text", placeholder: "glm-5.2" },
      {
        key: "defaultThinkingLevel", label: "Default thinking", description: "Thinking budget for new agents", type: "select",
        options: [
          { value: "off", label: "Off" }, { value: "minimal", label: "Minimal" },
          { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
          { value: "high", label: "High" }, { value: "xhigh", label: "X-High" },
        ],
      },
    ],
  },
  {
    title: "Appearance",
    fields: [
      { key: "theme", label: "Theme", description: "UI color theme", type: "select", options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] },
      { key: "hideThinkingBlock", label: "Hide thinking", description: "Collapse thinking blocks by default", type: "toggle" },
      { key: "collapseChangelog", label: "Collapse changelog", description: "Collapse changelog on startup", type: "toggle" },
      { key: "quietStartup", label: "Quiet startup", description: "Skip welcome message on startup", type: "toggle" },
    ],
  },
  {
    title: "Behavior",
    fields: [
      {
        key: "steeringMode", label: "Steering mode", description: "How steering messages are delivered", type: "select",
        options: [{ value: "all", label: "All at once" }, { value: "one-at-a-time", label: "One at a time" }],
      },
      {
        key: "followUpMode", label: "Follow-up mode", description: "How follow-up messages are delivered", type: "select",
        options: [{ value: "all", label: "All at once" }, { value: "one-at-a-time", label: "One at a time" }],
      },
      { key: "enableSkillCommands", label: "Skill commands", description: "Enable /skill commands", type: "toggle" },
      { key: "enableInstallTelemetry", label: "Telemetry", description: "Send anonymous usage telemetry", type: "toggle" },
      {
        key: "defaultProjectTrust", label: "Project trust", description: "Default trust for new projects", type: "select",
        options: [{ value: "ask", label: "Ask" }, { value: "always", label: "Always" }, { value: "never", label: "Never" }],
      },
    ],
  },
];

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [desktopConfig, setDesktopConfig] = useState<Record<string, unknown>>({});
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      window.pi?.getSettings().then(setSettings).catch(() => {});
      window.pi?.getDesktopConfig().then((cfg) => {
        setDesktopConfig(cfg);
        setSystemPrompt(String(cfg.systemPrompt ?? ""));
      }).catch(() => {});
    }
  }, [open]);

  const update = useCallback(async (key: string, value: unknown) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving(true);
    try {
      await window.pi?.updateSettings({ [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // revert on failure
      window.pi?.getSettings().then(setSettings).catch(() => {});
    } finally {
      setSaving(false);
    }
  }, []);

  if (!open) return null;

  const renderField = (f: SettingField) => {
    const val = settings[f.key];
    switch (f.type) {
      case "toggle":
        return (
          <label className="setting-toggle">
            <input type="checkbox" checked={!!val} onChange={(e) => update(f.key, e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        );
      case "select":
        return (
          <select className="setting-select" value={String(val ?? f.options?.[0]?.value ?? "")} onChange={(e) => update(f.key, e.target.value)}>
            {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      case "number":
        return <input className="setting-input" type="number" value={String(val ?? "")} placeholder={f.placeholder} onChange={(e) => update(f.key, Number(e.target.value))} />;
      default:
        return <input className="setting-input" type="text" value={String(val ?? "")} placeholder={f.placeholder} onChange={(e) => update(f.key, e.target.value)} />;
    }
  };

  return (
    <div className="settings-overlay" onMouseDown={onClose}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          {sections.map((section) => (
            <div key={section.title} className="settings-section">
              <h3 className="settings-section-title">{section.title}</h3>
              {section.fields.map((f) => (
                <div key={f.key} className="settings-row">
                  <div className="settings-info">
                    <span className="settings-label">{f.label}</span>
                    <span className="settings-desc">{f.description}</span>
                  </div>
                  <div className="settings-control">
                    {renderField(f)}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="settings-section">
            <h3 className="settings-section-title">System Prompt</h3>
            <div className="settings-row system-prompt-row">
              <div className="settings-info" style={{ width: "100%" }}>
                <span className="settings-label">Custom system prompt</span>
                <span className="settings-desc">Appended to every new agent session via --append-system-prompt. Existing sessions are unaffected.</span>
                <textarea
                  className="settings-textarea"
                  value={systemPrompt}
                  placeholder="e.g. You are an expert TypeScript developer. Always use strict mode."
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  onBlur={() => {
                    void window.pi?.updateDesktopConfig({ systemPrompt: systemPrompt || undefined }).then(setDesktopConfig).catch(() => {});
                  }}
                  rows={5}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="settings-footer">
          {saving && <span className="settings-saving">Saving...</span>}
          {saved && <span className="settings-saved">Saved</span>}
        </div>
      </div>
    </div>
  );
}
