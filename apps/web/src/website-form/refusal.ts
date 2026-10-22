// Why a visitor's enquiry was not taken: the api's reason when it gave one, and the HTTP status (0 when nothing answered).
export class FormRefusal extends Error {
  constructor(
    readonly reason: string | null,
    readonly status: number,
  ) {
    super(reason ?? `status ${String(status)}`);
    this.name = "FormRefusal";
  }
}
