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
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 17,
        fontWeight: 700,
        color: 'white',
        fontFamily: 'sans-serif',
        letterSpacing: '-0.5px',
      }}
    >
      인
    </div>,
    { width: 32, height: 32 }
  )
}
