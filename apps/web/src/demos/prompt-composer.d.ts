// The workspace package's generic source export leaves extensionless subpaths untyped.
declare module "@detent/ui/components/prompt-composer/prompt-composer" {
  export { PromptComposer } from "@detent/ui";
  export type { PromptComposerAttachment, PromptComposerModel, PromptComposerProps, PromptComposerSubmission, PromptComposerUpload } from "@detent/ui";
}
