import { CircleCheckIcon, InfoIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { ErrorIcon } from "./icons";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-icon" />,
        info: <InfoIcon className="size-icon" />,
        warning: <TriangleAlertIcon className="size-icon" />,
        error: <ErrorIcon className="size-icon" />,
        loading: <Loader2Icon className="size-icon animate-spin" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
