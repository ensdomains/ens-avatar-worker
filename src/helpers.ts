export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const makeResponse = (
  body?: BodyInit | null,
  status?: number,
  headers?: Record<string, any>
) => {
  return new Response(
    typeof body === "string" ? JSON.stringify({ message: body }) : body,
    {
      status,
      headers: {
        ...corsHeaders,
        ...(headers || {}),
      },
    }
  );
};
