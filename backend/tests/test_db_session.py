"""Building the database engine: the encrypted-connection settings."""

import ssl

import pytest

from app.db.session import DatabaseCertificateError, build_engine

MYSQL_URL = "mysql+pymysql://user:secret@db.example.com:3306/app"


def test_a_missing_certificate_file_names_the_setting_to_fix(tmp_path):
    missing = tmp_path / "ca.pem"

    with pytest.raises(DatabaseCertificateError, match="DATABASE_SSL_CA.*no file there"):
        build_engine(MYSQL_URL, ssl=True, ssl_ca=str(missing))


def test_a_file_that_is_not_a_certificate_is_reported(tmp_path):
    broken = tmp_path / "ca.pem"
    broken.write_text("not a certificate")

    with pytest.raises(DatabaseCertificateError, match="not a valid certificate"):
        build_engine(MYSQL_URL, ssl=True, ssl_ca=str(broken))


def test_without_a_file_the_systems_certificates_are_used():
    engine = build_engine(MYSQL_URL, ssl=True)

    assert engine.pool._pre_ping is True


def test_ssl_off_needs_no_certificate(tmp_path):
    build_engine(MYSQL_URL, ssl=False, ssl_ca=str(tmp_path / "missing.pem"))


def test_a_valid_certificate_file_is_used_and_the_server_is_checked(tmp_path, monkeypatch):
    ca_file = tmp_path / "ca.pem"
    ca_file.write_bytes(_self_signed_certificate())
    connect_args = {}
    monkeypatch.setattr(
        "app.db.session.create_engine",
        lambda url, **kwargs: connect_args.update(kwargs["connect_args"]) or _FakeEngine(),
    )

    build_engine(MYSQL_URL, ssl=True, ssl_ca=str(ca_file))

    context = connect_args["ssl"]
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    assert len(context.get_ca_certs()) == 1


class _FakeEngine:
    class dialect:  # noqa: N801
        name = "mysql"


def _self_signed_certificate() -> bytes:
    from datetime import UTC, datetime, timedelta

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID

    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test CA")])
    now = datetime.now(UTC)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    return certificate.public_bytes(serialization.Encoding.PEM)
