import { MoreHoriz } from '@mui/icons-material';
import { Box } from '@mui/material';

import { StyledButton, StyledIconButton } from '@/shared/ui';

interface ISavePackage {
  className?: string;
}

const SavePackage = (props: ISavePackage) => {
  const { className } = props;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        border: '1px solid black',
      }}
      className={className}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <StyledButton variant="contained">ADD</StyledButton>
        <span>file name</span>
        <StyledIconButton>
          <MoreHoriz />
        </StyledIconButton>
      </Box>

      <Box>пакет</Box>
    </Box>
  );
};

export default SavePackage;
