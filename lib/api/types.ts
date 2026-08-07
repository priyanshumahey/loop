/** The `{ data, error }` envelope every Loop API route responds with. */
export interface ApiResponse<T> {
  data?: T
  error?: string
}
