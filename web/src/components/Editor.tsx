import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";
import { cx } from "./ui";

export function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: false }), Link.configure({ openOnClick: false, protocols: ["http", "https", "mailto", "tel"], HTMLAttributes: { rel: "noopener noreferrer" } })],
    content: value,
    editorProps: { attributes: { "aria-label": "Message body", "data-placeholder": placeholder ?? "" } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);
  if (!editor) return null;
  const B = ({ on, active, label, children }: { on: () => void; active?: boolean; label: string; children: React.ReactNode }) => (
    <button type="button" onClick={on} aria-label={label} title={label} aria-pressed={active}
      className={cx("rounded-md p-1.5 text-ink-2 hover:bg-paper-2 hover:text-ink [&>svg]:size-4", active && "bg-paper-2 text-ink")}>{children}</button>
  );
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (https://…)", prev ?? "https://");
    if (url === null) return;
    if (!url || url === "https://") { editor.chain().focus().unsetLink().run(); return; }
    if (!/^(https?:|mailto:|tel:)/i.test(url)) { window.alert("Links must start with https://, http://, mailto: or tel:"); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  return (
    <div className="editor rounded-lg border border-line bg-card focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <div className="flex flex-wrap gap-0.5 border-b border-line-2 px-2 py-1.5" role="toolbar" aria-label="Formatting">
        <B label="Bold" on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold /></B>
        <B label="Italic" on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic /></B>
        <B label="Heading" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading")}><Heading2 /></B>
        <B label="Bulleted list" on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List /></B>
        <B label="Numbered list" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered /></B>
        <B label="Quote" on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}><Quote /></B>
        <B label="Link" on={setLink} active={editor.isActive("link")}><Link2 /></B>
        <span className="mx-1 w-px bg-line" />
        <B label="Undo" on={() => editor.chain().focus().undo().run()}><Undo2 /></B>
        <B label="Redo" on={() => editor.chain().focus().redo().run()}><Redo2 /></B>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
