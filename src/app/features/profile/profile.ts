import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.scss'
})
export class ProfileComponent {
  editMode = signal(false);
  showCurrentPassword = signal(false);
  
  toggleEditMode() {
    this.editMode.update(v => !v);
  }

  togglePasswords() {
    this.showCurrentPassword.update(v => !v);
  }
}
