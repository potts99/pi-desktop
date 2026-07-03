import "./styles/glass.css";
import { useSessions } from "./state/useSessions.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { InputBar } from "./components/InputBar.tsx";

export default function App() {
  const s = useSessions();
  return (
    <div className="app">
      <Sidebar
        groups={s.groups}
        onAddWorkspace={s.addWorkspace}
        onOpen={(path) => s.openSession({ path })}
        onNew={(cwd) => s.openSession({ newIn: cwd })}
      />
      <div className="main-pane">
        <Transcript messages={s.messages} />
        <InputBar
          disabled={!s.activeKey}
          streaming={s.streaming}
          models={s.models}
          onSend={s.send}
          onModel={(p, i) => s.activeKey && window.pi.setModel(s.activeKey, p, i)}
        />
      </div>
    </div>
  );
}
