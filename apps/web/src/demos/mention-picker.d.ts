// The workspace package's generic source export leaves extensionless subpaths untyped.
declare module "@detent/ui/components/mention-picker/mention-picker" {
  export { MentionInput, MentionPicker, mentionOptionId } from "@detent/ui";
  export type { MentionDraft, MentionInputHandle, MentionInputProps, MentionItem, MentionPickerProps, MentionToken } from "@detent/ui";
}
