import { Toast, type useToast } from './Toast';
import { useAppStore } from '../store/useAppStore';
export function SaveFeedback({ toast }: { toast: ReturnType<typeof useToast> }) {
  const error = useAppStore((state) => state.saveErrors[0]);
  const dismiss = useAppStore((state) => state.dismissSaveError);
  const pending = useAppStore((state) => state.pendingWrites);
  return <><span className="visually-hidden">{pending ? '保存中' : '保存処理完了'}</span>
    <Toast message={error ?? toast.message} dismiss={error ? dismiss : toast.dismiss} /></>;
}
