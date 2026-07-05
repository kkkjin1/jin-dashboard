import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: 32,
        height: 32,
        background: '#2E5E4A',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 4,
        gap: 2,
      }}
    >
      {/* Two leaves side by side */}
      <div style={{ display: 'flex', gap: 2 }}>
        <div style={{ width: 11, height: 8, background: '#7EC8A0', borderRadius: '50% 0 50% 0' }} />
        <div style={{ width: 11, height: 8, background: '#A8D5B5', borderRadius: '0 50% 0 50%' }} />
      </div>
      {/* Stem */}
      <div style={{ width: 2, height: 10, background: '#7EC8A0', borderRadius: 1 }} />
    </div>,
    { width: 32, height: 32 }
  )
}
