from unittest.mock import MagicMock, patch

from app.schemas.member import MemberUpdate


def make_mock_supabase(returned_row: dict):
    mock_sb = MagicMock()
    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [returned_row]
    return mock_sb


# ---------------------------------------------------------------------------
# update_member tests
# ---------------------------------------------------------------------------

@patch("app.services.member_service.supabase")
def test_only_provided_fields_are_sent_to_supabase(mock_sb):
    """exclude_unset=True means unset fields never reach the DB."""
    from app.services.member_service import update_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-1", "phone": "555-9999"}
    ]

    update_member("uuid-1", MemberUpdate(phone="555-9999"))

    sent = mock_sb.table.return_value.update.call_args[0][0]
    assert sent == {"phone": "555-9999"}
    assert "first_name" not in sent
    assert "email" not in sent


@patch("app.services.member_service.supabase")
def test_updated_fields_are_reflected_in_return_value(mock_sb):
    """The returned row contains the new values."""
    from app.services.member_service import update_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-2", "email": "new@example.com"}
    ]

    result = update_member("uuid-2", MemberUpdate(email="new@example.com"))

    assert result["email"] == "new@example.com"


@patch("app.services.member_service.supabase")
def test_correct_member_id_is_targeted(mock_sb):
    """The WHERE clause targets the exact member_id passed in."""
    from app.services.member_service import update_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-3"}
    ]

    update_member("uuid-3", MemberUpdate(phone="555-0000"))

    eq_call = mock_sb.table.return_value.update.return_value.eq.call_args
    assert eq_call[0] == ("id", "uuid-3")


@patch("app.services.member_service.supabase")
def test_empty_payload_sends_empty_dict(mock_sb):
    """MemberUpdate() with no fields set sends {} — no fields are overwritten."""
    from app.services.member_service import update_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-4"}
    ]

    update_member("uuid-4", MemberUpdate())

    sent = mock_sb.table.return_value.update.call_args[0][0]
    assert sent == {}


@patch("app.services.member_service.supabase")
def test_explicit_none_clears_a_field(mock_sb):
    """Passing phone=None explicitly should include phone in the update (to clear it)."""
    from app.services.member_service import update_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-5", "phone": None}
    ]

    update_member("uuid-5", MemberUpdate(phone=None))

    sent = mock_sb.table.return_value.update.call_args[0][0]
    assert "phone" in sent
    assert sent["phone"] is None


@patch("app.services.member_service.supabase")
def test_multiple_fields_updated_at_once(mock_sb):
    """A payload with several fields sends all of them together."""
    from app.services.member_service import update_member

    mock_sb.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": "uuid-6", "first_name": "Jane", "last_name": "Doe", "phone": "555-1234"}
    ]

    update_member("uuid-6", MemberUpdate(first_name="Jane", last_name="Doe", phone="555-1234"))

    sent = mock_sb.table.return_value.update.call_args[0][0]
    assert sent == {"first_name": "Jane", "last_name": "Doe", "phone": "555-1234"}
