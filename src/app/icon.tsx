import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

const SPROUT_B64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHJlY3QgeD0iMTEiIHk9IjEwIiB3aWR0aD0iMiIgaGVpZ2h0PSIxMiIgcng9IjEiIGZpbGw9IiM3RUM4QTAiLz48ZWxsaXBzZSBjeD0iNyIgY3k9IjkiIHJ4PSI2IiByeT0iMy41IiBmaWxsPSIjN0VDOEEwIiB0cmFuc2Zvcm09InJvdGF0ZSgtMzAgNyA5KSIvPjxlbGxpcHNlIGN4PSIxNyIgY3k9IjciIHJ4PSI2IiByeT0iMy41IiBmaWxsPSIjQThENUI1IiB0cmFuc2Zvcm09InJvdGF0ZSgzMCAxNyA3KSIvPjwvc3ZnPg=='

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        background: '#2E5E4A',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/svg+xml;base64,${SPROUT_B64}`}
        width={22}
        height={22}
        alt=""
      />
    </div>,
    { width: 32, height: 32 }
  )
}
