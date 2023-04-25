export default async (_r: any, _e: any, _c: any, name: string) => {
  return new Response(JSON.stringify({ message: "put", name }));
};
