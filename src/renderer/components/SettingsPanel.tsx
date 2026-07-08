import { useState, useEffect, useCallback } from "react";
import type { AdvisorConfig, ModelChoice, ThinkingLevel } from "../../shared/types.ts";

interface SettingField {
  key: string;
  label: string;
  description: string;
  type: "text" | "select" | "toggle" | "number" | "textarea" | "array";
  options?: { value: string; label: string; group?: string }[];
  placeholder?: string;
}

interface SettingsPage {
  id: string;
  title: string;
  fields?: SettingField[];
}

const pages: SettingsPage[] = [
  {
    id: "model-defaults",
    title: "Model defaults",
    fields: [
      { key: "defaultProvider", label: "Default provider", description: "Provider used for new agents", type: "select", options: [] },
      { key: "defaultModel", label: "Default model", description: "Model used for new agents", type: "select", options: [] },
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
    id: "appearance",
    title: "Appearance",
    fields: [
      { key: "theme", label: "Theme", description: "UI color theme", type: "select", options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }] },
      { key: "hideThinkingBlock", label: "Hide thinking", description: "Collapse thinking blocks by default", type: "toggle" },
      { key: "collapseChangelog", label: "Collapse changelog", description: "Collapse changelog on startup", type: "toggle" },
      { key: "quietStartup", label: "Quiet startup", description: "Skip welcome message on startup", type: "toggle" },
      { key: "showHardwareCursor", label: "Hardware cursor", description: "Use hardware text cursor in TUI", type: "toggle" },
    ],
  },
  {
    id: "behavior",
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
      {
        key: "doubleEscapeAction", label: "Double escape", description: "Action on double-escape in TUI", type: "select",
        options: [{ value: "quit", label: "Quit" }, { value: "close-agent", label: "Close agent" }],
      },
      {
        key: "treeFilterMode", label: "Tree filter", description: "@-mention tree filter mode", type: "select",
        options: [{ value: "fuzzy", label: "Fuzzy" }, { value: "prefix", label: "Prefix" }],
      },
      { key: "autocompleteMaxVisible", label: "Autocomplete items", description: "Max visible autocomplete entries", type: "number", placeholder: "8" },
    ],
  },
  {
    id: "editor",
    title: "Editor",
    fields: [
      { key: "externalEditor", label: "External editor", description: "Command to open external editor (e.g. 'code --wait')", type: "text", placeholder: "code --wait" },
      { key: "editorPaddingX", label: "Editor padding", description: "Horizontal padding in editor", type: "number", placeholder: "0" },
    ],
  },
  {
    id: "shell",
    title: "Shell",
    fields: [
      { key: "shellPath", label: "Shell path", description: "Path to shell executable", type: "text", placeholder: "/bin/zsh" },
      { key: "shellCommandPrefix", label: "Shell prefix", description: "Prefix prepended to shell commands", type: "text", placeholder: "source ~/.zshrc && " },
      { key: "npmCommand", label: "npm command", description: "npm command(s) space-separated", type: "array", placeholder: "npm" },
      { key: "outputPad", label: "Output padding", description: "Lines of padding after command output", type: "number", placeholder: "1" },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    fields: [
      { key: "transport", label: "Transport", description: "Agent transport protocol", type: "select", options: [{ value: "stdio", label: "stdio" }, { value: "http", label: "HTTP" }] },
      { key: "httpProxy", label: "HTTP proxy", description: "Proxy URL for agent HTTP transport", type: "text", placeholder: "http://localhost:8080" },
      { key: "sessionDir", label: "Session directory", description: "Override default session storage path", type: "text", placeholder: "~/.pi/agent/sessions" },
      { key: "httpIdleTimeoutMs", label: "HTTP idle timeout", description: "Idle timeout in milliseconds for HTTP transport", type: "number", placeholder: "300000" },
      { key: "websocketConnectTimeoutMs", label: "WebSocket timeout", description: "WebSocket connect timeout in milliseconds", type: "number", placeholder: "10000" },
    ],
  },
  { id: "models", title: "Models" },
  { id: "advisor", title: "Advisor" },
  { id: "system-prompt", title: "System Prompt" },
];

const defaultAdvisorConfig: AdvisorConfig = {
  enabled: false,
  model: null,
  thinkingLevel: "medium",
  instructions: "",
  maxConsecutive: 3,
};

const thinkingOptions: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function modelKey(model: ModelChoice | null): string {
  return model ? `${model.provider}/${model.id}` : "";
}

function modelFromKey(value: string): ModelChoice | null {
  const separator = value.indexOf("/");
  if (separator < 1) return null;
  return { provider: value.slice(0, separator), id: value.slice(separator + 1) };
}

export function SettingsPanel({ onClose, activeSessionKey }: { onClose: () => void; activeSessionKey?: string }) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [advisorConfig, setAdvisorConfig] = useState<AdvisorConfig>(defaultAdvisorConfig);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sharedModels, setSharedModels] = useState<Array<{ provider: string; id: string }>>([]);
  const [activePage, setActivePage] = useState(pages[0].id);

  useEffect(() => {
    window.pi?.getSettings().then(setSettings).catch(() => {});
    window.pi?.getAdvisorConfig().then(setAdvisorConfig).catch(() => {});
    window.pi?.getSystemPrompt?.().then(setSystemPrompt).catch(() => {});
  }, []);

  useEffect(() => {
    window.pi?.getSharedModels(activeSessionKey).then(setSharedModels).catch(() => {});
  }, [activeSessionKey]);

  const update = useCallback(async (key: string, value: unknown) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving(true);
    try {
      await window.pi?.updateSettings({ [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      window.pi?.getSettings().then(setSettings).catch(() => {});
    } finally {
      setSaving(false);
    }
  }, []);

  const updateAdvisor = useCallback(async (partial: Partial<AdvisorConfig>) => {
    setAdvisorConfig((current) => ({ ...current, ...partial }));
    setSaving(true);
    try {
      const savedConfig = await window.pi.updateAdvisorConfig(partial);
      setAdvisorConfig(savedConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, []);

  const saveSystemPrompt = useCallback(async () => {
    if (!window.pi?.updateSystemPrompt) return;
    setSaving(true);
    try {
      const savedSystemPrompt = await window.pi.updateSystemPrompt(systemPrompt);
      setSystemPrompt(savedSystemPrompt);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }, [systemPrompt]);

  const renderField = (f: SettingField) => {
    const val = settings[f.key];
    switch (f.type) {
      case "toggle":
        return (
          <label className="settings-toggle">
            <input type="checkbox" checked={!!val} onChange={(e) => update(f.key, e.target.checked)} />
            <span className="toggle-slider" />
          </label>
        );
      case "select": {
        const opts = f.options ?? [];
        const groups = new Map<string, typeof opts>();
        const ungrouped: typeof opts = [];
        for (const o of opts) {
          if (o.group) {
            const g = groups.get(o.group) ?? [];
            g.push(o);
            groups.set(o.group, g);
          } else {
            ungrouped.push(o);
          }
        }
        return (
          <select className="settings-select" value={String(val ?? opts[0]?.value ?? "")} onChange={(e) => update(f.key, e.target.value)}>
            {ungrouped.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            {[...groups.entries()].map(([group, groupOpts]) => (
              <optgroup key={group} label={group}>
                {groupOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        );
      }
      case "number":
        return <input className="settings-input" type="number" value={String(val ?? "")} placeholder={f.placeholder} onChange={(e) => update(f.key, Number(e.target.value))} />;
      case "array": {
        const arr = Array.isArray(val) ? val : [];
        const text = arr.join(" ");
        return <input className="settings-input" type="text" value={text} placeholder={f.placeholder} onChange={(e) => update(f.key, e.target.value.split(/\s+/).filter(Boolean))} />;
      }
      default:
        return <input className="settings-input" type="text" value={String(val ?? "")} placeholder={f.placeholder} onChange={(e) => update(f.key, e.target.value)} />;
    }
  };

  const activePageDef = pages.find((p) => p.id === activePage);

  return (
    <div className="settings-layout">
      <div className="settings-topbar" onDoubleClick={async () => { const m = await window.pi?.isMaximized(); m ? window.pi?.unmaximizeWindow() : window.pi?.maximizeWindow(); }}>
        <button className="settings-back-btn" onClick={onClose} title="Back">
          <span className="settings-back-arrow">←</span>
        </button>
        <span className="settings-title">Settings</span>
      </div>
      <div className="settings-body">
        <div className="settings-nav" aria-label="Settings pages">
          {pages.map((page) => (
            <button
              key={page.id}
              className={`settings-nav-item${activePage === page.id ? " settings-nav-active" : ""}`}
              onClick={() => setActivePage(page.id)}
            >
              {page.title}
            </button>
          ))}
        </div>
        <div className="settings-content">
          {activePageDef?.fields && (() => {
            const providerOptions = [...new Set(sharedModels.map((m) => m.provider))].map((p) => ({ value: p, label: p }));
            const selectedProvider = settings.defaultProvider as string | undefined;
            const modelOptions = sharedModels
              .filter((m) => !selectedProvider || m.provider === selectedProvider)
              .map((m) => ({ value: `${m.provider}/${m.id}`, label: m.id, group: m.provider }));
            const resolvedFields = activePageDef.fields.map((f) => {
              if (f.key === "defaultProvider") return { ...f, options: providerOptions };
              if (f.key === "defaultModel") return { ...f, options: modelOptions };
              return f;
            });
            return (
              <div className="settings-section">
                <h3 className="settings-section-title">{activePageDef.title}</h3>
                {resolvedFields.map((f) => (
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
            );
          })()}
          {activePage === "models" && (
            <div className="settings-section">
              <h3 className="settings-section-title">Models</h3>
              <p className="settings-desc" style={{ marginBottom: 12 }}>Toggle models on or off. Hidden models won't appear in the composer picker.</p>
              {sharedModels.length === 0 && (
                <div className="settings-desc" style={{ color: "var(--cursor-text-quaternary)" }}>No models found.</div>
              )}
              {Object.entries(
                sharedModels.reduce<Record<string, typeof sharedModels>>((groups, m) => {
                  (groups[m.provider] ??= []).push(m);
                  return groups;
                }, {})
              ).map(([provider, models]) => (
                <div key={provider} className="model-provider-group">
                  <h4 className="model-provider-title">{provider}</h4>
                  {models.map((m) => {
                    const key = `${m.provider}/${m.id}`;
                    const hidden = ((settings.hiddenModels as string[] | undefined) ?? []).includes(key);
                    const toggleModel = (show: boolean) => {
                      const cur = (settings.hiddenModels as string[] | undefined) ?? [];
                      const next = show ? cur.filter((h) => h !== key) : [...cur, key];
                      void update("hiddenModels", next.length > 0 ? next : undefined);
                    };
                    return (
                      <div key={key} className="settings-row">
                        <div className="settings-info">
                          <span className="settings-label" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{m.id}</span>
                        </div>
                        <div className="settings-control">
                          <label className="settings-toggle">
                            <input type="checkbox" checked={!hidden} onChange={(e) => toggleModel(e.target.checked)} />
                            <span className="toggle-slider" />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {activePage === "advisor" && (
            <div className="settings-section">
              <h3 className="settings-section-title">Advisor</h3>
              <div className="settings-row">
                <div className="settings-info">
                  <span className="settings-label">Enable advisor</span>
                  <span className="settings-desc">Review every worker turn and inject concise guidance.</span>
                </div>
                <div className="settings-control">
                  <label className="settings-toggle">
                    <input type="checkbox" checked={advisorConfig.enabled} onChange={(event) => void updateAdvisor({ enabled: event.target.checked })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info">
                  <span className="settings-label">Advisor model</span>
                  <span className="settings-desc">Usually a stronger model than the worker.</span>
                </div>
                <div className="settings-control">
                  <select className="settings-select" value={modelKey(advisorConfig.model)} onChange={(event) => void updateAdvisor({ model: modelFromKey(event.target.value) })}>
                    <option value="">Select model</option>
                    {sharedModels.map((model) => {
                      const key = modelKey(model);
                      return <option key={key} value={key}>{model.provider}/{model.id}</option>;
                    })}
                  </select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info">
                  <span className="settings-label">Advisor thinking</span>
                  <span className="settings-desc">Reasoning budget for advisor reviews.</span>
                </div>
                <div className="settings-control">
                  <select className="settings-select" value={advisorConfig.thinkingLevel} onChange={(event) => void updateAdvisor({ thinkingLevel: event.target.value as ThinkingLevel })}>
                    {thinkingOptions.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info">
                  <span className="settings-label">Max consecutive advisories</span>
                  <span className="settings-desc">Stops advisor/worker ping-pong without user input.</span>
                </div>
                <div className="settings-control">
                  <input className="settings-input" type="number" min={1} value={advisorConfig.maxConsecutive} onChange={(event) => void updateAdvisor({ maxConsecutive: Number(event.target.value) })} />
                </div>
              </div>
              <div className="settings-row system-prompt-row">
                <div className="settings-info" style={{ width: "100%" }}>
                  <span className="settings-label">Advisor instructions</span>
                  <span className="settings-desc">Project review priorities, like a desktop-level WATCHDOG.md.</span>
                  <textarea
                    className="settings-textarea"
                    value={advisorConfig.instructions}
                    placeholder="e.g. Watch for unsafe renderer output, missing tests, and over-engineered abstractions."
                    onChange={(event) => setAdvisorConfig((current) => ({ ...current, instructions: event.target.value }))}
                    onBlur={() => void updateAdvisor({ instructions: advisorConfig.instructions })}
                    rows={5}
                  />
                </div>
              </div>
            </div>
          )}
          {activePage === "system-prompt" && (
            <div className="settings-section">
              <h3 className="settings-section-title">System Prompt</h3>
              <div className="settings-row system-prompt-row">
                <div className="settings-info" style={{ width: "100%" }}>
                  <span className="settings-label">Custom system prompt</span>
                  <span className="settings-desc">Saved to ~/.pi/agent/SYSTEM.md. New sessions use it as Pi's system prompt override.</span>
                  <textarea
                    className="settings-textarea"
                    value={systemPrompt}
                    placeholder="e.g. You are an expert TypeScript developer. Always use strict mode."
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    onBlur={() => {
                      void saveSystemPrompt();
                    }}
                    rows={5}
                  />
                  <button className="settings-button" onClick={() => void saveSystemPrompt()}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="settings-footer">
        {saving && <span className="settings-saving">Saving...</span>}
        {saved && <span className="settings-saved">Saved</span>}
      </div>
    </div>
  );
}
