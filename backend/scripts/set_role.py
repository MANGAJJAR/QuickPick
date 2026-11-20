"""Provision a user's role (and store) as Firebase custom claims. Run by an operator, never by the API.

    python -m scripts.set_role --uid <firebase-uid> --role STORE_STAFF --store-id store-a
    python -m scripts.set_role --email manager@example.com --role STORE_MANAGER --store-id store-a
    python -m scripts.set_role --uid <firebase-uid> --role CUSTOMER

The user must sign out/in (or refresh their ID token) before the new claims appear.
"""

from __future__ import annotations

import argparse

from app.core.config import get_settings
from app.core.firebase import init_firebase_admin
from app.shared.enums import Role

STORE_ROLES = {Role.STORE_STAFF, Role.STORE_MANAGER}


def build_claims(role: Role, store_id: str | None) -> dict[str, str]:
    """Validate and build the custom-claims payload."""
    if role in STORE_ROLES and not store_id:
        raise ValueError(f"{role.value} requires --store-id")
    if role not in STORE_ROLES and store_id:
        raise ValueError(f"{role.value} must not have a store id")
    claims = {"role": role.value}
    if store_id:
        claims["store_id"] = store_id
    return claims


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--uid", help="Firebase user id (or use --email)")
    parser.add_argument("--email", help="Look the user up by email instead of --uid")
    parser.add_argument("--role", required=True, choices=[r.value for r in Role])
    parser.add_argument("--store-id")
    args = parser.parse_args()
    if not args.uid and not args.email:
        parser.error("give --uid or --email")
    claims = build_claims(Role(args.role), args.store_id)
    init_firebase_admin(get_settings())
    from firebase_admin import auth

    uid = args.uid or auth.get_user_by_email(args.email).uid
    auth.set_custom_user_claims(uid, claims)
    print(f"Set claims for {args.email or uid} ({uid}): {claims}")


if __name__ == "__main__":
    main()
