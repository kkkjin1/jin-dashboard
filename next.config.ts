import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    '@tiptap/core',
    '@tiptap/react',
    '@tiptap/starter-kit',
    '@tiptap/pm',
    '@tiptap/extensions',
    '@tiptap/extension-blockquote',
    '@tiptap/extension-bold',
    '@tiptap/extension-bubble-menu',
    '@tiptap/extension-bullet-list',
    '@tiptap/extension-code',
    '@tiptap/extension-code-block',
    '@tiptap/extension-color',
    '@tiptap/extension-document',
    '@tiptap/extension-dropcursor',
    '@tiptap/extension-floating-menu',
    '@tiptap/extension-gapcursor',
    '@tiptap/extension-hard-break',
    '@tiptap/extension-heading',
    '@tiptap/extension-highlight',
    '@tiptap/extension-horizontal-rule',
    '@tiptap/extension-italic',
    '@tiptap/extension-link',
    '@tiptap/extension-list',
    '@tiptap/extension-list-item',
    '@tiptap/extension-list-keymap',
    '@tiptap/extension-ordered-list',
    '@tiptap/extension-paragraph',
    '@tiptap/extension-strike',
    '@tiptap/extension-text',
    '@tiptap/extension-text-style',
    '@tiptap/extension-underline',
  ],
};

export default nextConfig;
