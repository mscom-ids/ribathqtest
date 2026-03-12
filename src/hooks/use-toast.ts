import { toast } from "sonner"

export function useToast() {
  return {
    toast: (props: { title?: string; description?: string; variant?: 'default' | 'destructive' }) => {
      const msg = props.description ? `${props.title}: ${props.description}` : (props.title || "");
      if (props.variant === 'destructive') {
        toast.error(msg)
      } else {
        toast.success(msg)
      }
    }
  }
}
