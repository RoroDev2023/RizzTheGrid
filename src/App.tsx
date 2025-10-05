import HeadLine from "./HeadLine";
import USInteractiveMap from "./Map";
import DataSourceFooter from "./Footer";


export default function App() {
  return (
    <div className="min-h-screen flex flex-col mb-4">
      <HeadLine />
      <main className="flex-1 w-full">
        <USInteractiveMap />
      </main>
      <DataSourceFooter />
    </div>
  );
}