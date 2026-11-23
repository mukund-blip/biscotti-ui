// The workspace package's generic source export leaves extensionless subpaths untyped.
declare module "@biscotti/ui/components/mention-picker/mention-picker" {
  export { MentionInput, MentionPicker, mentionOptionId } from "@biscotti/ui";
  export type { MentionDraft, MentionInputHandle, MentionInputProps, MentionItem, MentionPickerProps, MentionToken } from "@biscotti/ui";
}
