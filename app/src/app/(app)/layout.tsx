import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 sm:px-6">{children}</main>
    </>
  );
}
