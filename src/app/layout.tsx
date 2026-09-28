import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Telstra Network & Infrastructure | Kong Yim',description:'Explore a fictional global network on a draggable 2D map and 3D globe. A portfolio recreation built with Next.js, TypeScript, PixiJS and Three.js.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
