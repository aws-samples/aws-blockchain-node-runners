// This file requires user configuration, see README.md.

// Output of `aws kms generate-data-key-pair --key-pair-spec ECC_SECG_P256K1 ...`
// These should be DER-encoded X.509 public keys in Base64.
export const PUBLIC_KEYS_BASE64 = [
    // SAMPLE KEY 0 - Replace with your own generated public key.
    "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAE0QUVS7sI61U1NkmeUZmOgkLhqtVwmQIYD3Cma0OvedeB/OBzAjEvXyqljsscZ0MIUXfZSir25Sp3K9TQxD/VNQ==",
    // SAMPLE KEY 1 - Replace with your own generated public key.
    "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAE83LdjlQXxF3Z8IAXuT2hzsJvGYDXrb3emf/vDUw7+VT9FYCNYzyPfgC5ia+yKkQnFe8XyCF0XtbJmP/VU+8S/g==",
    // SAMPLE KEY 2 - Replace with your own generated public key.
    "MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEYSoXBzM+HxoNoeYw65a6J3mxxDYPhsxchWUdtRYEXeh/X/3RgPAjvefbh4tXUMXRPcyeiBTlXDWmcHsAk5Q/DA==",
];