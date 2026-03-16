export const GET = (req: { params?: { id?: string } }) =>
    Response.json({ id: req.params?.id });
