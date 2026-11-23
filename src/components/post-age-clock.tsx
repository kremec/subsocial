import {
  createContext,
  type FC,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";

export const PostAgeClockContext = createContext<number | null>(null);

interface PostAgeClockProps {
  children: ReactNode;
}

export const PostAgeClock: FC<PostAgeClockProps> = (props) => {
  const { children } = props;
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now());
    const updateTimer = (state: typeof AppState.currentState) => {
      clearInterval(timer);
      timer = state === "active" ? setInterval(tick, 1000) : undefined;
    };
    const listener = AppState.addEventListener("change", (state) => {
      updateTimer(state);
      if (state === "active") tick();
    });
    updateTimer(AppState.currentState);

    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);

  return <PostAgeClockContext value={now}>{children}</PostAgeClockContext>;
};
