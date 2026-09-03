import { useCallback, useEffect, useRef, useState } from "react";
import {
  clientId,
  createBus,
  readPersistedState,
  type LiveState,
  type SyncBus,
  type SyncMessage,
} from "@/lib/presenter-sync";

const PRESENCE_INTERVAL = 1500;
const PRESENCE_TIMEOUT = 4500;

// Plain `Omit<LiveState, "revision">` doesn't distribute over the LiveState
// union (keyof a union only yields shared keys), which silently drops the
// scripture-only fields. A generic distributive Omit fixes it: the naked
// type parameter `T` is what makes conditional types distribute over unions.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type LiveStateInput = DistributiveOmit<LiveState, "revision">;

/** Control Panel side: owns live state, tracks connected Output windows. */
export function useController() {
  const [live, setLive] = useState<LiveState>(() => ({ mode: "blank", revision: 0 }));
  const [outputs, setOutputs] = useState(0);
  const busRef = useRef<SyncBus | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const seenOutputs = new Map<string, number>();
    const restored = readPersistedState();
    setLive(restored);
    liveRef.current = restored;

    const bus = createBus((message: SyncMessage) => {
      if (message.type === "request-state") {
        bus.publish({ type: "state", state: liveRef.current });
      } else if (message.type === "presence" && message.role === "output") {
        seenOutputs.set(message.clientId, Date.now());
        setOutputs(seenOutputs.size);
      } else if (message.type === "bye") {
        seenOutputs.delete(message.clientId);
        setOutputs(seenOutputs.size);
      } else if (message.type === "state") {
        setLive(message.state);
      }
    });
    busRef.current = bus;
    bus.publish({ type: "presence", role: "control", clientId, at: Date.now() });

    const sweep = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, at] of seenOutputs) {
        if (now - at > PRESENCE_TIMEOUT) {
          seenOutputs.delete(id);
          changed = true;
        }
      }
      if (changed) setOutputs(seenOutputs.size);
    }, PRESENCE_INTERVAL);

    return () => {
      window.clearInterval(sweep);
      bus.close();
      busRef.current = null;
    };
  }, []);

  const push = useCallback((next: LiveStateInput) => {
    const state = { ...next, revision: Date.now() } as LiveState;
    setLive(state);
    liveRef.current = state;
    busRef.current?.publish({ type: "state", state });
  }, []);

  return { live, outputs, push };
}

/** Output side: mirrors live state, announces presence, asks for catch-up. */
export function useOutput() {
  const [live, setLive] = useState<LiveState>(() => ({ mode: "blank", revision: 0 }));

  useEffect(() => {
    setLive(readPersistedState());

    const bus = createBus((message: SyncMessage) => {
      if (message.type === "state") setLive(message.state);
      if (message.type === "presence" && message.role === "control") {
        bus.publish({ type: "presence", role: "output", clientId, at: Date.now() });
      }
    });

    bus.publish({ type: "request-state", from: clientId });
    const beat = () => bus.publish({ type: "presence", role: "output", clientId, at: Date.now() });
    beat();
    const timer = window.setInterval(beat, PRESENCE_INTERVAL);
    const bye = () => bus.publish({ type: "bye", clientId });
    window.addEventListener("pagehide", bye);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", bye);
      bye();
      bus.close();
    };
  }, []);

  return live;
}
