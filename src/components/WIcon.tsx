// 根据 WMO 天气码渲染对应天气图标
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "lucide-react";
import { codeKind } from "../lib/weather";

interface Props {
  code: number;
  size?: number;
  className?: string;
}

export default function WIcon({ code, size = 18, className = "" }: Props) {
  const kind = codeKind(code);
  const common = { size, strokeWidth: 1.9 };
  const cls = `wi wi-${kind} ${className}`;
  switch (kind) {
    case "sun":
      return (
        <span className={cls}>
          <Sun {...common} />
        </span>
      );
    case "partly":
      return (
        <span className={cls}>
          <CloudSun {...common} />
        </span>
      );
    case "rain":
      return (
        <span className={cls}>
          <CloudRain {...common} />
        </span>
      );
    case "snow":
      return (
        <span className={cls}>
          <CloudSnow {...common} />
        </span>
      );
    case "thunder":
      return (
        <span className={cls}>
          <CloudLightning {...common} />
        </span>
      );
    case "fog":
      return (
        <span className={cls}>
          <CloudFog {...common} />
        </span>
      );
    default:
      return (
        <span className={cls}>
          <Cloud {...common} />
        </span>
      );
  }
}
