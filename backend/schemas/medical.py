from pydantic import BaseModel, Field


class EmergencyContact(BaseModel):
    name: str
    phone: str
    relation: str | None = None


class DoctorInfo(BaseModel):
    name: str | None = None
    phone: str | None = None
    hospital: str | None = None


class PatientProfile(BaseModel):
    id: str = Field(default="primary")
    patient_name: str = Field(alias="patientName")
    blood_group: str | None = Field(default=None, alias="bloodGroup")
    allergies: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    disability: str | None = None
    emergency_contacts: list[EmergencyContact] = Field(default_factory=list, alias="emergencyContacts")
    doctor: DoctorInfo = Field(default_factory=DoctorInfo)
    medical_notes: str | None = Field(default=None, alias="medicalNotes")
    medical_condition: str | None = Field(default=None, alias="medicalCondition")

    model_config = {"populate_by_name": True}


class PatientProfileResponse(PatientProfile):
    updated_at: str | None = None

