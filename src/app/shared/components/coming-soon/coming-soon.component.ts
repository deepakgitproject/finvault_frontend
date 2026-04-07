import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalUiService } from '../../../core/services/global-ui.service';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './coming-soon.html',
  styleUrl: './coming-soon.scss'
})
export class ComingSoonComponent {
  public globalUiService = inject(GlobalUiService);
}

